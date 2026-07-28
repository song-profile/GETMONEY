from __future__ import annotations

import tkinter as tk
from pathlib import Path

import matplotlib
import pandas as pd

try:
    matplotlib.use("TkAgg")
except Exception:
    matplotlib.use("Agg")

import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg

from src.analysis import (
    build_alerts,
    build_risk_profile,
    build_signal_metrics,
    compute_indicators,
    fetch_stock_data,
    load_sample_data,
    run_strategy_backtest,
    summarize,
)


class StockOverlayApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("Stock Intelligence Overlay")
        self.root.geometry("1100x850")
        self.root.configure(bg="#07111f")
        self.root.attributes("-topmost", True)
        self.root.wm_attributes("-alpha", 0.95)
        self._center_window()

        self._refreshing = False
        self._refresh_job = None

        self._bind_drag()
        self._build_ui()
        self._toggle_auto_refresh()
        self._load_and_render()

    def _center_window(self) -> None:
        self.root.update_idletasks()
        screen_width = self.root.winfo_screenwidth()
        screen_height = self.root.winfo_screenheight()
        width, height = 1100, 850
        x = (screen_width - width) // 2
        y = (screen_height - height) // 2
        self.root.geometry(f"{width}x{height}+{x}+{y}")
        self.root.lift()
        self.root.focus_force()

    def _build_ui(self) -> None:
        header = tk.Frame(self.root, bg="#0b1628", height=60)
        header.pack(fill="x", padx=0, pady=0)

        title = tk.Label(header, text="📊 Stock Intelligence", fg="#f5f7fb", bg="#0b1628", font=("Helvetica", 20, "bold"))
        title.pack(side="left", padx=16, pady=12)

        self.pin_var = tk.BooleanVar(value=True)
        pin_btn = tk.Checkbutton(header, text="Always on top", variable=self.pin_var, bg="#0b1628", fg="#c7d2fe", selectcolor="#1e293b", command=self._toggle_pin, font=("Helvetica", 10))
        pin_btn.pack(side="right", padx=16, pady=12)

        body = tk.Frame(self.root, bg="#07111f")
        body.pack(fill="both", expand=True, padx=12, pady=12)

        controls = tk.Frame(body, bg="#0f172a", relief="flat", bd=1)
        controls.pack(fill="x", pady=(0, 12))

        tk.Label(controls, text="Ticker", bg="#0f172a", fg="#94a3b8", font=("Helvetica", 10)).pack(side="left", padx=10, pady=8)
        self.ticker_entry = tk.Entry(controls, width=12, bg="#111827", fg="#f8fafc", font=("Helvetica", 11))
        self.ticker_entry.insert(0, "AAPL")
        self.ticker_entry.pack(side="left", padx=(0, 12))

        tk.Label(controls, text="Compare", bg="#0f172a", fg="#94a3b8", font=("Helvetica", 10)).pack(side="left", padx=(10, 0), pady=8)
        self.compare_entry = tk.Entry(controls, width=20, bg="#111827", fg="#f8fafc", font=("Helvetica", 11))
        self.compare_entry.insert(0, "MSFT,TSLA")
        self.compare_entry.pack(side="left", padx=(0, 12))

        self.analyze_btn = tk.Button(controls, text="▶ Analyze", command=self._load_and_render, bg="#2563eb", fg="#ffffff", relief="flat", font=("Helvetica", 11, "bold"), padx=12, pady=6)
        self.analyze_btn.pack(side="left", padx=(0, 12))

        sep = tk.Frame(controls, bg="#1e293b", height=1)
        sep.pack(fill="x", padx=10, pady=0)

        options = tk.Frame(controls, bg="#0f172a")
        options.pack(fill="x", padx=10, pady=8)

        self.auto_refresh_var = tk.BooleanVar(value=True)
        auto_cb = tk.Checkbutton(options, text="Auto refresh", variable=self.auto_refresh_var, bg="#0f172a", fg="#cbd5e1", selectcolor="#1e293b", command=self._toggle_auto_refresh, font=("Helvetica", 10))
        auto_cb.pack(side="left")

        tk.Label(options, text="  Interval(s)", bg="#0f172a", fg="#94a3b8", font=("Helvetica", 10)).pack(side="left", padx=(12, 0))
        self.refresh_interval_var = tk.IntVar(value=60)
        refresh_spin = tk.Spinbox(options, from_=10, to=300, increment=10, textvariable=self.refresh_interval_var, width=6, font=("Helvetica", 10))
        refresh_spin.pack(side="left", padx=(4, 12))

        self.status_var = tk.StringVar(value="Ready")
        status_label = tk.Label(options, textvariable=self.status_var, bg="#0f172a", fg="#38bdf8", font=("Helvetica", 10, "bold"))
        status_label.pack(side="left", padx=10)

        content = tk.Frame(body, bg="#07111f")
        content.pack(fill="both", expand=True)

        left_panel = tk.Frame(content, bg="#0f172a", relief="flat", bd=1)
        left_panel.pack(side="left", fill="both", expand=True, padx=(0, 8))

        tk.Label(left_panel, text="📈 Analysis", bg="#0f172a", fg="#f8fafc", font=("Helvetica", 12, "bold")).pack(anchor="w", padx=12, pady=8)
        self.output_text = tk.Text(left_panel, height=20, wrap="word", bg="#0b1220", fg="#e2e8f0", font=("Helvetica", 10), bd=0)
        self.output_text.pack(fill="both", expand=True, padx=10, pady=(0, 10))

        right_panel = tk.Frame(content, bg="#0f172a", relief="flat", bd=1)
        right_panel.pack(side="left", fill="both", expand=True)

        tk.Label(right_panel, text="🎯 Strategy", bg="#0f172a", fg="#f8fafc", font=("Helvetica", 12, "bold")).pack(anchor="w", padx=12, pady=8)
        self.strategy_text = tk.Text(right_panel, height=20, wrap="word", bg="#0b1220", fg="#e2e8f0", font=("Helvetica", 10), bd=0)
        self.strategy_text.pack(fill="both", expand=True, padx=10, pady=(0, 10))

        self.figure_frame = tk.Frame(body, bg="#0f172a", relief="flat", bd=1)
        self.figure_frame.pack(fill="both", expand=True, pady=(8, 0))

    def _toggle_pin(self) -> None:
        self.root.attributes("-topmost", self.pin_var.get())

    def _bind_drag(self) -> None:
        self.root.bind("<ButtonPress-1>", self._start_drag)
        self.root.bind("<B1-Motion>", self._on_drag)

    def _start_drag(self, event: tk.Event) -> None:
        self._drag_data = {"x": event.x, "y": event.y}

    def _on_drag(self, event: tk.Event) -> None:
        dx = event.x - self._drag_data["x"]
        dy = event.y - self._drag_data["y"]
        x = self.root.winfo_x() + dx
        y = self.root.winfo_y() + dy
        self.root.geometry(f"+{x}+{y}")

    def _toggle_auto_refresh(self) -> None:
        if self.auto_refresh_var.get():
            self._start_auto_refresh()
        else:
            self._stop_auto_refresh()

    def _start_auto_refresh(self) -> None:
        self._stop_auto_refresh()
        if not self.auto_refresh_var.get():
            return
        interval = max(10, int(self.refresh_interval_var.get()))
        self._refresh_job = self.root.after(interval * 1000, self._auto_refresh_tick)

    def _stop_auto_refresh(self) -> None:
        if self._refresh_job is not None:
            self.root.after_cancel(self._refresh_job)
            self._refresh_job = None

    def _auto_refresh_tick(self) -> None:
        self._refresh_job = None
        self._load_and_render()
        self._start_auto_refresh()

    def _load_and_render(self) -> None:
        if self._refreshing:
            return
        self._refreshing = True
        self.status_var.set("Loading...")
        self.root.update_idletasks()

        main_ticker = self.ticker_entry.get().strip().upper() if hasattr(self, "ticker_entry") else "AAPL"
        compare_tickers = [item.strip().upper() for item in self.compare_entry.get().split(",") if item.strip()]
        if not compare_tickers:
            compare_tickers = [main_ticker]

        try:
            main_df = self._load_dataframe(main_ticker)
            self._render_summary(main_df)
            self._render_chart(main_df, main_ticker)
            datasets = [main_df]
            for ticker in compare_tickers:
                if ticker == main_ticker:
                    continue
                datasets.append(self._load_dataframe(ticker))
            self._populate_comparison_table(datasets)
            self._render_strategy_simulation(main_df)
            self._render_alerts(main_df)
            self.status_var.set("Updated")
        except Exception as exc:  # pragma: no cover - UI fallback
            self.status_var.set(f"Error: {exc}")
            self.output_text.delete("1.0", tk.END)
            self.output_text.insert(tk.END, f"Failed to load data.\n{exc}")
        finally:
            self._refreshing = False

    def _load_dataframe(self, ticker: str) -> pd.DataFrame:
        try:
            df = fetch_stock_data(ticker, period="2y", interval="1d")
        except Exception:
            df = load_sample_data(Path(__file__).resolve().parent.parent / "data" / "sample.csv")
            df["Ticker"] = ticker
        return compute_indicators(df)

    def _render_summary(self, df) -> None:
        self.output_text.delete("1.0", tk.END)
        self.output_text.insert(tk.END, summarize(df))

    def _render_chart(self, df, ticker: str) -> None:
        for widget in self.figure_frame.winfo_children():
            widget.destroy()

        fig, ax = plt.subplots(figsize=(10.5, 4.2), dpi=120)
        ax.plot(df["Date"], df["Close"], label="Close", color="#60a5fa", linewidth=2.0)
        ax.plot(df["Date"], df["SMA20"], label="SMA20", color="#f59e0b", linewidth=1.3)
        ax.plot(df["Date"], df["SMA50"], label="SMA50", color="#8b5cf6", linewidth=1.3)
        ax.set_title(f"{ticker} Price Trend", pad=10, color="#f8fafc")
        ax.set_xlabel("Date", color="#cbd5e1")
        ax.set_ylabel("Price", color="#cbd5e1")
        ax.grid(True, alpha=0.2)
        ax.set_facecolor("#0b1220")
        fig.patch.set_facecolor("#0f172a")
        ax.tick_params(colors="#94a3b8")
        fig.autofmt_xdate()
        ax.legend(loc="upper left", fontsize=8, frameon=False)

        canvas = FigureCanvasTkAgg(fig, master=self.figure_frame)
        canvas.draw()
        canvas.get_tk_widget().pack(fill="both", expand=True, padx=10, pady=10)
        plt.close(fig)

    def _populate_comparison_table(self, datasets) -> None:
        """Store comparison data for later rendering in strategy panel."""
        self._comparison_data = []
        for df in datasets:
            ticker = df["Ticker"].iloc[0] if "Ticker" in df.columns else "Sample"
            metrics = build_signal_metrics(df)
            latest_close = float(df.iloc[-1]["Close"])
            self._comparison_data.append({
                "ticker": ticker,
                "signal": metrics["signal"],
                "score": metrics["score"],
                "price": f"{latest_close:.2f}",
                "change": f"{metrics['change_pct']:+.2f}%",
            })

    def _render_strategy_simulation(self, df) -> None:
        self.strategy_text.delete("1.0", tk.END)
        ticker = df["Ticker"].iloc[0] if "Ticker" in df.columns else "Sample"
        
        # Show comparison table if available
        output = "📊 Market Comparison\n" + "="*50 + "\n"
        if hasattr(self, '_comparison_data') and self._comparison_data:
            for item in self._comparison_data:
                output += f"  {item['ticker']:8s} {item['signal']:6s} Score:{item['score']:+3d} Price:{item['price']:>10s} {item['change']:>8s}\n"
        output += "\n"
        
        # Show strategy simulation
        output += f"🎯 Strategy Simulation [{ticker}]\n" + "="*50 + "\n"
        backtest = run_strategy_backtest(df)
        risk = build_risk_profile(df)
        output += f"Initial Capital: ${backtest['start_cash']:,.0f}\n"
        output += f"Final Value:     ${backtest['final_value']:,.0f}\n"
        output += f"Return:          {backtest['return_pct']:+.2f}%\n"
        output += f"Closed Trades:   {backtest['trade_count']}\n"
        output += f"Win Rate:        {backtest['win_rate']:.1f}%\n"
        output += f"Max Drawdown:    {backtest['max_drawdown']:.2f}%\n\n"
        output += "🛡 Risk / Position Plan\n" + "="*50 + "\n"
        output += f"Stop Loss:       ${risk['stop_loss']:.2f}\n"
        output += f"Targets:         ${risk['first_target']:.2f} / ${risk['second_target']:.2f}\n"
        output += f"ATR(14):         ${risk['atr']:.2f}\n"
        output += f"Volatility(20):  {risk['volatility']:.1f}%\n"
        output += f"Position Size:   {risk['position_size']:,} shares\n"
        output += f"Position Value:  ${risk['position_value']:,.0f}\n\n"
        output += "Note: Simulation is rule-based and excludes fees, spread, slippage, and taxes."
        self.strategy_text.insert(tk.END, output)

    def _render_alerts(self, df) -> None:
        alerts = build_alerts(df)
        self._last_alerts = alerts
        self.output_text.insert(tk.END, "\n\n===== Alerts =====\n")
        if not alerts:
            self.output_text.insert(tk.END, "No strong signals at the moment.")
            return
        for alert in alerts:
            self.output_text.insert(tk.END, f"[{alert['type']}] {alert['message']} / Price {alert['price']:.2f}\n")


def main() -> None:
    root = tk.Tk()
    StockOverlayApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
