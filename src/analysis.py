from __future__ import annotations

from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

try:
    import yfinance as yf
except ImportError:  # pragma: no cover - dependency may be absent during install
    yf = None

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "sample.csv"


def load_sample_data(path: Optional[str | Path] = None) -> pd.DataFrame:
    target = Path(path or DATA_PATH)
    df = pd.read_csv(target, parse_dates=["Date"])
    df = df.sort_values("Date").reset_index(drop=True)
    return df


def fetch_stock_data(ticker: str, period: str = "2y", interval: str = "1d") -> pd.DataFrame:
    if yf is None:
        raise ImportError("yfinance 패키지가 설치되지 않았습니다.")

    ticker = ticker.strip().upper()
    if not ticker:
        raise ValueError("티커를 입력해 주세요.")

    data = yf.download(ticker, period=period, interval=interval, progress=False, auto_adjust=False)
    if data.empty:
        raise ValueError(f"{ticker}의 데이터를 가져오지 못했습니다.")

    df = data.reset_index()
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [col[0] if isinstance(col, tuple) else col for col in df.columns]

    if "Date" not in df.columns:
        if "Datetime" in df.columns:
            df = df.rename(columns={"Datetime": "Date"})
        else:
            df = df.rename(columns={df.columns[0]: "Date"})

    if "Date" in df.columns:
        df["Date"] = pd.to_datetime(df["Date"])
        if getattr(df["Date"].dt, "tz", None) is not None:
            df["Date"] = df["Date"].dt.tz_convert(None)

    available = [col for col in ["Open", "High", "Low", "Close", "Volume"] if col in df.columns]
    if len(available) < 5:
        raise ValueError(f"{ticker} 데이터 형식이 예상과 다릅니다.")

    df = df[["Date", *[col for col in ["Open", "High", "Low", "Close", "Volume"] if col in df.columns]]].copy()
    df = df.sort_values("Date").reset_index(drop=True)
    df["Ticker"] = ticker
    return df


def compute_indicators(df: pd.DataFrame) -> pd.DataFrame:
    result = df.copy()
    result["SMA20"] = result["Close"].rolling(window=20).mean()
    result["SMA50"] = result["Close"].rolling(window=50).mean()

    delta = result["Close"].diff()
    gain = delta.clip(lower=0)
    loss = (-delta).clip(lower=0)

    avg_gain = gain.rolling(window=14).mean()
    avg_loss = loss.rolling(window=14).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    result["RSI14"] = 100 - (100 / (1 + rs))

    ema12 = result["Close"].ewm(span=12, adjust=False).mean()
    ema26 = result["Close"].ewm(span=26, adjust=False).mean()
    result["MACD"] = ema12 - ema26
    result["Signal"] = result["MACD"].ewm(span=9, adjust=False).mean()

    rolling_mean = result["Close"].rolling(window=20).mean()
    rolling_std = result["Close"].rolling(window=20).std()
    result["BB_upper"] = rolling_mean + 2 * rolling_std
    result["BB_lower"] = rolling_mean - 2 * rolling_std

    previous_close = result["Close"].shift(1)
    true_range = pd.concat(
        [
            result["High"] - result["Low"],
            (result["High"] - previous_close).abs(),
            (result["Low"] - previous_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    result["ATR14"] = true_range.rolling(window=14).mean()
    result["Volatility20"] = result["Close"].pct_change().rolling(window=20).std() * np.sqrt(252) * 100

    return result


def _safe_float(value: object, fallback: float = 0.0) -> float:
    numeric = pd.to_numeric(value, errors="coerce")
    if pd.isna(numeric):
        return fallback
    return float(numeric)


def build_signal_metrics(df: pd.DataFrame) -> dict:
    latest = df.iloc[-1]
    previous = df.iloc[-2] if len(df) > 1 else latest

    latest_close = _safe_float(latest["Close"])
    previous_close = _safe_float(previous["Close"], latest_close)
    change_pct = ((latest_close / previous_close) - 1) * 100 if previous_close else 0.0

    sma20 = _safe_float(latest.get("SMA20"), latest_close)
    sma50 = _safe_float(latest.get("SMA50"), sma20)
    rsi = _safe_float(latest.get("RSI14"), 50.0)
    macd = _safe_float(latest.get("MACD"))
    signal = _safe_float(latest.get("Signal"))
    prev_macd = _safe_float(previous.get("MACD"), macd)
    prev_signal = _safe_float(previous.get("Signal"), signal)

    bullish_score = 0
    bearish_score = 0
    reasons: list[str] = []

    if latest_close > sma20:
        bullish_score += 1
        reasons.append("20일선 위")
    else:
        bearish_score += 1
        reasons.append("20일선 아래")

    if latest_close > sma50:
        bullish_score += 1
        reasons.append("50일선 위")
    else:
        bearish_score += 1
        reasons.append("50일선 아래")

    if latest_close > previous_close:
        bullish_score += 1
        reasons.append("최근 상승")
    else:
        bearish_score += 1
        reasons.append("최근 하락")

    if macd > signal:
        bullish_score += 1
        reasons.append("MACD > Signal")
        if prev_macd <= prev_signal:
            bullish_score += 1
            reasons.append("MACD 골든크로스")
    else:
        bearish_score += 1
        reasons.append("MACD < Signal")
        if prev_macd >= prev_signal:
            bearish_score += 1
            reasons.append("MACD 데드크로스")

    if rsi < 30:
        bullish_score += 1
        reasons.append("RSI 과매도")
    elif rsi > 70:
        bearish_score += 1
        reasons.append("RSI 과열")
    else:
        reasons.append("RSI 중립")

    if latest_close > sma20 and latest_close > sma50:
        bullish_score += 1
        reasons.append("상향 추세")
    elif latest_close < sma20 and latest_close < sma50:
        bearish_score += 1
        reasons.append("하향 추세")

    score = bullish_score - bearish_score
    if score >= 4:
        label = "매수"
    elif score <= -4:
        label = "매도"
    else:
        label = "관망"

    confidence = min(95, max(55, 40 + abs(score) * 8))
    return {
        "signal": label,
        "score": score,
        "confidence": confidence,
        "change_pct": change_pct,
        "reasons": reasons,
    }


def build_risk_profile(df: pd.DataFrame, account_size: float = 100000.0, risk_pct: float = 1.0) -> dict:
    latest = df.iloc[-1]
    close = _safe_float(latest["Close"])
    atr = _safe_float(latest.get("ATR14"), close * 0.02)
    volatility = _safe_float(latest.get("Volatility20"))

    recent = df.tail(min(len(df), 60))
    support = _safe_float(recent["Low"].min(), close)
    resistance = _safe_float(recent["High"].max(), close)

    stop_loss = max(0.0, close - (atr * 2))
    first_target = close + (atr * 2)
    second_target = close + (atr * 3)
    risk_per_share = max(close - stop_loss, 0.01)
    max_risk_amount = account_size * (risk_pct / 100)
    position_size = int(max_risk_amount // risk_per_share)
    position_value = position_size * close

    return {
        "atr": atr,
        "volatility": volatility,
        "support": support,
        "resistance": resistance,
        "stop_loss": stop_loss,
        "first_target": first_target,
        "second_target": second_target,
        "risk_per_share": risk_per_share,
        "position_size": position_size,
        "position_value": position_value,
        "risk_pct": risk_pct,
    }


def run_strategy_backtest(df: pd.DataFrame, start_cash: float = 100000.0) -> dict:
    cash = start_cash
    shares = 0.0
    entry_price: float | None = None
    trades: list[dict] = []
    equity_curve: list[float] = []

    for index, row in df.reset_index(drop=True).iterrows():
        close = _safe_float(row["Close"])
        if close <= 0:
            continue

        metrics = build_signal_metrics(df.iloc[: index + 1])
        if metrics["signal"] == "매수" and shares == 0:
            shares = cash / close
            cash = 0.0
            entry_price = close
            trades.append({"side": "BUY", "date": row["Date"], "price": close})
        elif metrics["signal"] == "매도" and shares > 0 and entry_price is not None:
            cash = shares * close
            profit_pct = ((close / entry_price) - 1) * 100
            shares = 0.0
            entry_price = None
            trades.append({"side": "SELL", "date": row["Date"], "price": close, "profit_pct": profit_pct})

        equity_curve.append(cash + shares * close)

    if shares > 0:
        cash = shares * _safe_float(df.iloc[-1]["Close"])
        equity_curve[-1] = cash

    final_value = cash
    sells = [trade for trade in trades if trade["side"] == "SELL"]
    wins = [trade for trade in sells if trade.get("profit_pct", 0.0) > 0]
    peak = -np.inf
    max_drawdown = 0.0
    for value in equity_curve:
        peak = max(peak, value)
        if peak > 0:
            max_drawdown = min(max_drawdown, (value / peak - 1) * 100)

    return {
        "start_cash": start_cash,
        "final_value": final_value,
        "return_pct": ((final_value / start_cash) - 1) * 100,
        "trades": trades,
        "trade_count": len(sells),
        "win_rate": (len(wins) / len(sells) * 100) if sells else 0.0,
        "max_drawdown": max_drawdown,
    }


def build_alerts(df: pd.DataFrame, threshold: float = 3.0) -> list[dict]:
    metrics = build_signal_metrics(df)
    latest = df.iloc[-1]
    alerts = []
    if metrics["score"] >= threshold:
        alerts.append({
            "type": "buy",
            "message": f"{df['Ticker'].iloc[0]} 매수 신호 강하게 형성됨",
            "price": float(latest["Close"]),
        })
    if metrics["score"] <= -threshold:
        alerts.append({
            "type": "sell",
            "message": f"{df['Ticker'].iloc[0]} 매도 신호 강하게 형성됨",
            "price": float(latest["Close"]),
        })
    return alerts


def summarize(df: pd.DataFrame) -> str:
    latest = df.iloc[-1]
    metrics = build_signal_metrics(df)
    risk = build_risk_profile(df)
    latest_close = _safe_float(latest["Close"])

    ticker = df["Ticker"].iloc[0] if "Ticker" in df.columns else "Sample"
    reasons = ", ".join(metrics["reasons"])
    return (
        f"티커: {ticker}\n"
        f"최근 종가: {latest_close:.2f}\n"
        f"20일선: {_safe_float(latest.get('SMA20'), latest_close):.2f}\n"
        f"50일선: {_safe_float(latest.get('SMA50'), latest_close):.2f}\n"
        f"RSI(14): {_safe_float(latest.get('RSI14'), 50.0):.1f}\n"
        f"MACD: {_safe_float(latest.get('MACD')):.2f}\n"
        f"Signal: {_safe_float(latest.get('Signal')):.2f}\n"
        f"변화율: {metrics['change_pct']:+.2f}%\n"
        f"추세 점수: {metrics['score']}\n"
        f"판단: {metrics['signal']} ({metrics['confidence']}%)\n"
        f"근거: {reasons}\n\n"
        f"===== Risk Plan =====\n"
        f"ATR(14): {risk['atr']:.2f}\n"
        f"20일 변동성: {risk['volatility']:.1f}%\n"
        f"60일 지지/저항: {risk['support']:.2f} / {risk['resistance']:.2f}\n"
        f"손절 기준: {risk['stop_loss']:.2f}\n"
        f"목표가: {risk['first_target']:.2f} / {risk['second_target']:.2f}\n"
        f"권장 수량(계좌 1% 리스크): {risk['position_size']:,}주"
    )
