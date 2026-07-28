(function initIknyOverlay() {
  const existingPanel = document.getElementById("ikny-overlay");
  if (existingPanel) {
    existingPanel.remove();
  }
  window.__iknyOverlayLoaded = true;

  const state = {
    minimized: false,
    lastKey: "",
    refreshMs: 30000,
    timer: null,
    scanResults: [],
    scanning: false
  };

  const SCAN_UNIVERSE = [
    { name: "Apple", symbol: "AAPL", candidates: ["AAPL"], url: "https://www.google.com/finance/quote/AAPL:NASDAQ" },
    { name: "Microsoft", symbol: "MSFT", candidates: ["MSFT"], url: "https://www.google.com/finance/quote/MSFT:NASDAQ" },
    { name: "NVIDIA", symbol: "NVDA", candidates: ["NVDA"], url: "https://www.google.com/finance/quote/NVDA:NASDAQ" },
    { name: "Tesla", symbol: "TSLA", candidates: ["TSLA"], url: "https://www.google.com/finance/quote/TSLA:NASDAQ" },
    { name: "Alphabet", symbol: "GOOGL", candidates: ["GOOGL"], url: "https://www.google.com/finance/quote/GOOGL:NASDAQ" },
    { name: "Amazon", symbol: "AMZN", candidates: ["AMZN"], url: "https://www.google.com/finance/quote/AMZN:NASDAQ" },
    { name: "Meta", symbol: "META", candidates: ["META"], url: "https://www.google.com/finance/quote/META:NASDAQ" },
    { name: "Netflix", symbol: "NFLX", candidates: ["NFLX"], url: "https://www.google.com/finance/quote/NFLX:NASDAQ" },
    { name: "AMD", symbol: "AMD", candidates: ["AMD"], url: "https://www.google.com/finance/quote/AMD:NASDAQ" },
    { name: "Broadcom", symbol: "AVGO", candidates: ["AVGO"], url: "https://www.google.com/finance/quote/AVGO:NASDAQ" },
    { name: "삼성전자", symbol: "005930", candidates: ["005930.KS"], url: "https://finance.naver.com/item/main.naver?code=005930" },
    { name: "SK하이닉스", symbol: "000660", candidates: ["000660.KS"], url: "https://finance.naver.com/item/main.naver?code=000660" },
    { name: "NAVER", symbol: "035420", candidates: ["035420.KS"], url: "https://finance.naver.com/item/main.naver?code=035420" },
    { name: "카카오", symbol: "035720", candidates: ["035720.KS"], url: "https://finance.naver.com/item/main.naver?code=035720" },
    { name: "현대차", symbol: "005380", candidates: ["005380.KS"], url: "https://finance.naver.com/item/main.naver?code=005380" },
    { name: "기아", symbol: "000270", candidates: ["000270.KS"], url: "https://finance.naver.com/item/main.naver?code=000270" },
    { name: "LG에너지솔루션", symbol: "373220", candidates: ["373220.KS"], url: "https://finance.naver.com/item/main.naver?code=373220" },
    { name: "삼성바이오로직스", symbol: "207940", candidates: ["207940.KS"], url: "https://finance.naver.com/item/main.naver?code=207940" },
    { name: "셀트리온", symbol: "068270", candidates: ["068270.KS"], url: "https://finance.naver.com/item/main.naver?code=068270" },
    { name: "POSCO홀딩스", symbol: "005490", candidates: ["005490.KS"], url: "https://finance.naver.com/item/main.naver?code=005490" },
    { name: "에코프로비엠", symbol: "247540", candidates: ["247540.KQ"], url: "https://finance.naver.com/item/main.naver?code=247540" },
    { name: "알테오젠", symbol: "196170", candidates: ["196170.KQ"], url: "https://finance.naver.com/item/main.naver?code=196170" },
    { name: "HLB", symbol: "028300", candidates: ["028300.KQ"], url: "https://finance.naver.com/item/main.naver?code=028300" },
    { name: "JYP Ent.", symbol: "035900", candidates: ["035900.KQ"], url: "https://finance.naver.com/item/main.naver?code=035900" }
  ];

  const panel = buildPanel();
  (document.body || document.documentElement).appendChild(panel);

  makeDraggable(panel, panel.querySelector(".ikny-header"));
  panel.querySelector("#ikny-refresh").addEventListener("click", () => runSafely(() => refresh(true)));
  panel.addEventListener("click", (event) => {
    const scanButton = event.target.closest("#ikny-scan");
    const closeButton = event.target.closest("#ikny-scan-close");
    if (scanButton) {
      runSafely(() => scanStrongBuys());
    }
    if (closeButton) {
      state.scanResults = [];
      const scanBox = panel.querySelector("#ikny-scan-results");
      if (scanBox) {
        scanBox.remove();
      }
    }
  });
  panel.querySelector("#ikny-minimize").addEventListener("click", () => {
    state.minimized = !state.minimized;
    panel.classList.toggle("ikny-minimized", state.minimized);
    panel.querySelector("#ikny-minimize").textContent = state.minimized ? "+" : "−";
  });

  runSafely(() => refresh(true));
  state.timer = window.setInterval(() => runSafely(() => refresh(false)), state.refreshMs);
  observeUrlChanges(() => runSafely(() => refresh(true)));

  function buildPanel() {
    const root = document.createElement("section");
    root.id = "ikny-overlay";

    const header = document.createElement("div");
    header.className = "ikny-header";

    const titleBox = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = "Ikny";
    const source = document.createElement("span");
    source.id = "ikny-source";
    source.textContent = "Detecting...";
    titleBox.append(title, source);

    const actions = document.createElement("div");
    actions.className = "ikny-actions";
    const refreshButton = document.createElement("button");
    refreshButton.id = "ikny-refresh";
    refreshButton.type = "button";
    refreshButton.title = "Refresh";
    refreshButton.textContent = "↻";
    const minimizeButton = document.createElement("button");
    minimizeButton.id = "ikny-minimize";
    minimizeButton.type = "button";
    minimizeButton.title = "Minimize";
    minimizeButton.textContent = "−";
    actions.append(refreshButton, minimizeButton);

    const body = document.createElement("div");
    body.id = "ikny-body";
    body.className = "ikny-body";
    const status = document.createElement("div");
    status.className = "ikny-status";
    status.textContent = "현재 페이지에서 종목을 감지하는 중...";
    body.append(status);

    header.append(titleBox, actions);
    root.append(header, body);
    return root;
  }

  async function refresh(force) {
    const detected = detectTicker();
    const key = `${detected.market}:${detected.displaySymbol}:${detected.name}`;
    const changedPage = key !== state.lastKey;
    state.lastKey = key;

    if (force || changedPage) {
      renderLoading(detected);
    }

    if (!detected.candidates.length) {
      renderError("종목을 자동 감지하지 못했습니다.", "Google Finance 또는 네이버 금융의 개별 종목 페이지에서 사용하세요.");
      return;
    }

    try {
      const payload = await fetchChart(detected.candidates);
      const analysis = analyzeRows(payload.rows);
      renderAnalysis(detected, payload, analysis);
    } catch (error) {
      renderError("시세 데이터를 불러오지 못했습니다.", error.message || "네트워크 또는 티커 매핑 문제입니다.");
    }
  }

  function detectTicker() {
    const url = new URL(location.href);
    const title = document.title.replace(/\s+/g, " ").trim();

    if (location.hostname.includes("finance.naver.com")) {
      const code = url.searchParams.get("code") || textMatch(document.body.innerText, /\b(\d{6})\b/);
      return {
        market: "NAVER",
        displaySymbol: code || "",
        name: title.split(":")[0] || "Naver Finance",
        candidates: code ? [`${code}.KS`, `${code}.KQ`, code] : []
      };
    }

    if (location.hostname.includes("m.stock.naver.com")) {
      const code = textMatch(location.pathname, /\/domestic\/stock\/(\d{6})/) || textMatch(document.body.innerText, /\b(\d{6})\b/);
      return {
        market: "NAVER",
        displaySymbol: code || "",
        name: title.split(":")[0] || "Naver Stock",
        candidates: code ? [`${code}.KS`, `${code}.KQ`, code] : []
      };
    }

    if (location.hostname.includes("google.com")) {
      const decodedPath = safeDecode(location.pathname);
      const pathSymbol = decodedPath.match(/\/finance\/quote\/([^/?#]+)/)?.[1] || "";
      const bodySymbol = findGoogleFinanceSymbol(document.body.innerText);
      const rawSymbol = pathSymbol || bodySymbol;
      const [rawTicker = "", rawExchange = ""] = rawSymbol.split(":");
      const ticker = rawTicker.trim().toUpperCase();
      const exchange = rawExchange.trim().toUpperCase();
      return {
        market: exchange || "GOOGLE",
        displaySymbol: ticker,
        name: title.split("-")[0]?.trim() || ticker,
        candidates: ticker ? [ticker] : []
      };
    }

    return { market: "UNKNOWN", displaySymbol: "", name: title, candidates: [] };
  }

  function analyzeRows(rows) {
    const close = rows.map((row) => Number(row.close));
    const high = rows.map((row) => Number(row.high));
    const low = rows.map((row) => Number(row.low));
    const latest = rows[rows.length - 1];
    const previous = rows[rows.length - 2] || latest;
    const latestClose = Number(latest.close);
    const previousClose = Number(previous.close) || latestClose;

    const sma20 = average(close.slice(-20));
    const sma50 = average(close.slice(-50));
    const rsi14 = rsi(close, 14);
    const ema12 = ema(close, 12);
    const ema26 = ema(close, 26);
    const macdSeries = ema12.map((value, index) => value - ema26[index]);
    const signalSeries = ema(macdSeries, 9);
    const macd = last(macdSeries);
    const signal = last(signalSeries);
    const prevMacd = macdSeries[macdSeries.length - 2] ?? macd;
    const prevSignal = signalSeries[signalSeries.length - 2] ?? signal;
    const atr14 = atr(high, low, close, 14);
    const volatility20 = std(close.slice(-21).map((value, index, arr) => index === 0 ? 0 : value / arr[index - 1] - 1).slice(1)) * Math.sqrt(252) * 100;

    let bullish = 0;
    let bearish = 0;
    const reasons = [];

    latestClose > sma20 ? (bullish++, reasons.push("최근 20일 평균보다 높음")) : (bearish++, reasons.push("최근 20일 평균보다 낮음"));
    latestClose > sma50 ? (bullish++, reasons.push("최근 50일 평균보다 높음")) : (bearish++, reasons.push("최근 50일 평균보다 낮음"));
    latestClose > previousClose ? (bullish++, reasons.push("어제보다 상승")) : (bearish++, reasons.push("어제보다 하락"));

    if (macd > signal) {
      bullish++;
      reasons.push("단기 흐름이 개선 중");
      if (prevMacd <= prevSignal) {
        bullish++;
        reasons.push("상승 전환 신호 발생");
      }
    } else {
      bearish++;
      reasons.push("단기 흐름이 약해지는 중");
      if (prevMacd >= prevSignal) {
        bearish++;
        reasons.push("하락 전환 신호 발생");
      }
    }

    if (rsi14 < 30) {
      bullish++;
      reasons.push("많이 빠진 구간");
    } else if (rsi14 > 70) {
      bearish++;
      reasons.push("단기 과열 구간");
    } else {
      reasons.push("과열/침체는 아님");
    }

    if (latestClose > sma20 && latestClose > sma50) {
      bullish++;
      reasons.push("전체 흐름은 상승 쪽");
    } else if (latestClose < sma20 && latestClose < sma50) {
      bearish++;
      reasons.push("전체 흐름은 하락 쪽");
    }

    const score = bullish - bearish;
    const opinionScore = Math.min(100, Math.max(0, Math.round(50 + score * 8)));
    const signalLabel = opinionScore >= 65 ? "매수 우세" : opinionScore <= 35 ? "매도 우세" : "관망";
    const decisionClass = opinionScore >= 65 ? "buy" : opinionScore <= 35 ? "sell" : "hold";
    const confidence = Math.abs(opinionScore - 50) * 2;
    const recent = rows.slice(-60);
    const support = Math.min(...recent.map((row) => Number(row.low)));
    const resistance = Math.max(...recent.map((row) => Number(row.high)));
    const stopLoss = Math.max(0, latestClose - atr14 * 2);
    const target1 = latestClose + atr14 * 2;
    const target2 = latestClose + atr14 * 3;
    const stopLossPct = latestClose > 0 ? (stopLoss / latestClose - 1) * 100 : 0;
    const weeklyForecast = buildWeeklyForecast({
      opinionScore,
      changePct: (latestClose / previousClose - 1) * 100,
      latestClose,
      sma20,
      sma50,
      rsi14,
      volatility20,
      support,
      resistance
    });

    return {
      latestClose,
      changePct: (latestClose / previousClose - 1) * 100,
      sma20,
      sma50,
      rsi14,
      macd,
      signal,
      score,
      opinionScore,
      signalLabel,
      decisionClass,
      confidence,
      reasons,
      atr14,
      volatility20,
      support,
      resistance,
      stopLoss,
      stopLossPct,
      target1,
      target2,
      weeklyForecast,
      date: latest.date
    };
  }

  function renderLoading(detected) {
    panel.querySelector("#ikny-source").textContent = `${detected.market} ${detected.displaySymbol || ""}`.trim();
    const status = document.createElement("div");
    status.className = "ikny-status";
    status.textContent = "분석 데이터 로딩 중...";
    panel.querySelector("#ikny-body").replaceChildren(status);
  }

  function renderError(title, detail) {
    const titleNode = document.createElement("div");
    titleNode.className = "ikny-error";
    titleNode.textContent = title;
    const detailNode = document.createElement("p");
    detailNode.textContent = detail;
    panel.querySelector("#ikny-body").replaceChildren(titleNode, detailNode);
  }

  function renderAnalysis(detected, payload, analysis) {
    const currency = payload.currency ? ` ${payload.currency}` : "";
    const body = panel.querySelector("#ikny-body");
    panel.querySelector("#ikny-source").textContent = `${detected.market} ${detected.displaySymbol || payload.symbol}`;

    const quote = createNode("div", "ikny-quote");
    const quoteLeft = createNode("div");
    quoteLeft.append(
      createNode("span", "ikny-name", detected.name || payload.symbol),
      createNode("strong", "", `${formatNumber(analysis.latestClose)}${currency}`)
    );
    quote.append(quoteLeft, createNode("span", analysis.changePct >= 0 ? "ikny-up" : "ikny-down", `${formatSigned(analysis.changePct)}%`));

    const signal = createNode("div", `ikny-signal ikny-${analysis.decisionClass}`);
    const signalText = createNode("div");
    signalText.append(createNode("span", "", analysis.signalLabel), createNode("small", "", scoreGuide(analysis.opinionScore)));
    signal.append(signalText, createNode("b", "", `${analysis.opinionScore}점`));

    const meter = createNode("div", `ikny-meter ikny-meter-${analysis.decisionClass}`);
    const meterFill = createNode("span");
    meterFill.style.width = `${analysis.opinionScore}%`;
    meter.append(meterFill);

    const scale = createNode("div", "ikny-score-scale");
    scale.append(createNode("span", "", "0 매도"), createNode("span", "", "50 관망"), createNode("span", "", "100 매수"));

    const grid = createNode("div", "ikny-grid");
    appendLabelValue(grid, "단기 평균가", formatNumber(analysis.sma20), "최근 20거래일 평균 가격입니다.");
    appendLabelValue(grid, "중기 평균가", formatNumber(analysis.sma50), "최근 50거래일 평균 가격입니다.");
    appendLabelValue(grid, "과열도", `${formatNumber(analysis.rsi14)} / 100`, "70 이상이면 과열, 30 이하면 많이 빠진 구간으로 봅니다.");
    appendLabelValue(grid, "하루 변동폭", formatNumber(analysis.atr14), "최근 하루 평균 움직임 폭입니다.");

    const plan = createNode("div", "ikny-plan");
    appendPlanRow(plan, "손실 제한선", formatNumber(analysis.stopLoss), "이 가격 아래로 내려가면 손실 제한을 검토하는 기준입니다.");
    appendPlanRow(plan, "손실 제한폭", `${formatSigned(analysis.stopLossPct)}%`, "현재가에서 손실 제한선까지의 거리입니다.");
    appendPlanRow(plan, "기대 목표가", `${formatNumber(analysis.target1)} / ${formatNumber(analysis.target2)}`, "가격이 오를 때 1차로 이익 실현을 검토할 수 있는 구간입니다.");
    appendPlanRow(plan, "아래/위 가격대", `${formatNumber(analysis.support)} / ${formatNumber(analysis.resistance)}`, "최근 60거래일 기준으로 많이 막혔던 아래/위 가격대입니다.");

    const summary = createNode("p", "ikny-reasons");
    summary.append(createNode("b", "", "쉽게 말하면"), document.createTextNode(` ${plainSummary(analysis)}`));

    const forecast = createNode("p", "ikny-ai-line");
    forecast.append(createNode("b", "", "AI 일주일 전망"), document.createTextNode(` ${analysis.weeklyForecast}`));

    const scanButton = createNode("button", "ikny-scan-button", "70점 이상 종목 찾기");
    scanButton.id = "ikny-scan";
    scanButton.type = "button";
    const footer = createNode("footer", "", `${payload.symbol} · ${analysis.date} · 30초 자동 갱신`);

    const children = [quote, signal, meter, scale, grid, plan, summary, forecast, scanButton];
    const scanResults = buildScanResults();
    if (scanResults) {
      children.push(scanResults);
    }
    children.push(footer);
    body.replaceChildren(...children);
  }

  async function scanStrongBuys() {
    if (state.scanning) {
      return;
    }
    state.scanning = true;
    state.scanResults = [];
    updateScanResults(buildScanLoading());

    const results = [];
    for (const item of SCAN_UNIVERSE) {
      try {
        const payload = await fetchChart(item.candidates);
        const analysis = analyzeRows(payload.rows);
        if (analysis.opinionScore >= 70) {
          results.push({
            ...item,
            fetchedSymbol: payload.symbol,
            price: analysis.latestClose,
            changePct: analysis.changePct,
            opinionScore: analysis.opinionScore,
            forecast: analysis.weeklyForecast
          });
          results.sort((a, b) => b.opinionScore - a.opinionScore);
          state.scanResults = results.slice(0, 8);
          updateScanResults(buildScanResults());
        }
      } catch (_error) {
        // Some symbols may be unavailable from Yahoo at scan time. Skip them.
      }
    }

    state.scanning = false;
    state.scanResults = results.sort((a, b) => b.opinionScore - a.opinionScore).slice(0, 8);
    updateScanResults(buildScanResults(true));
  }

  function fetchChart(candidates) {
    return new Promise((resolve, reject) => {
      if (!isRuntimeReady()) {
        reject(new Error("확장 프로그램이 새로고침되었습니다. 이 주식 페이지도 새로고침해 주세요."));
        return;
      }

      try {
        chrome.runtime.sendMessage({ type: "IKNY_FETCH_CHART", candidates }, (response) => {
          const runtimeError = chrome.runtime.lastError;
          if (runtimeError) {
            reject(new Error(cleanRuntimeError(runtimeError.message)));
            return;
          }
          if (!response?.ok) {
            reject(new Error(response?.error || "데이터 요청 실패"));
            return;
          }
          resolve(response.payload);
        });
      } catch (error) {
        reject(new Error(cleanRuntimeError(error.message || String(error))));
      }
    });
  }

  function isRuntimeReady() {
    try {
      return Boolean(chrome?.runtime?.id && chrome.runtime.sendMessage);
    } catch (_error) {
      return false;
    }
  }

  function cleanRuntimeError(message) {
    if (String(message || "").includes("Extension context invalidated")) {
      window.clearInterval(state.timer);
      const retry = window.setTimeout(() => {
        window.clearTimeout(retry);
      }, 0);
      return "확장 프로그램이 새로고침되었습니다. 이 주식 페이지도 새로고침해 주세요.";
    }
    return message || "확장 프로그램 연결이 끊겼습니다. 페이지를 새로고침해 주세요.";
  }
  function buildScanLoading() {
    const box = createNode("div", "ikny-scan-box");
    box.id = "ikny-scan-results";
    box.append(createNode("b", "", "찾는 중..."), createNode("p", "", `기본 관심 종목 ${SCAN_UNIVERSE.length}개를 분석하고 있습니다.`));
    return box;
  }

  function buildScanResults(done = false) {
    if (!state.scanResults.length) {
      if (!done) {
        return null;
      }
      const box = createScanBox("70점 이상 종목");
      box.append(createNode("p", "", "이번 기본 목록에서는 70점 이상 종목이 없습니다."));
      return box;
    }

    const box = createScanBox(`70점 이상 종목 ${done ? "완료" : "검색 중"}`);
    state.scanResults.forEach((item) => {
      const link = createNode("a", "ikny-scan-item");
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      const info = createNode("span");
      info.append(createNode("strong", "", item.name), createNode("small", "", `${item.fetchedSymbol || item.symbol} · ${formatNumber(item.price)}`));
      link.append(info, createNode("b", "", `${item.opinionScore}점`), createNode("em", item.changePct >= 0 ? "ikny-up" : "ikny-down", `${formatSigned(item.changePct)}%`));
      box.append(link);
    });
    box.append(createNode("p", "", "기본 관심 종목 기준입니다. 실제 매수 전에는 뉴스와 실적도 확인하세요."));
    return box;
  }

  function createScanBox(title) {
    const box = createNode("div", "ikny-scan-box");
    box.id = "ikny-scan-results";
    const header = createNode("div", "ikny-scan-title");
    const closeButton = createNode("button", "", "×");
    closeButton.id = "ikny-scan-close";
    closeButton.type = "button";
    header.append(createNode("b", "", title), closeButton);
    box.append(header);
    return box;
  }

  function updateScanResults(node) {
    const existing = panel.querySelector("#ikny-scan-results");
    if (existing) {
      existing.replaceWith(node);
      return;
    }
    const scanButton = panel.querySelector("#ikny-scan");
    if (scanButton && node) {
      scanButton.after(node);
    }
  }

  function createNode(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text) {
      node.textContent = text;
    }
    return node;
  }

  function appendLabelValue(parent, label, value, title = "") {
    const labelNode = createNode("span", "", label);
    if (title) {
      labelNode.title = title;
    }
    parent.append(labelNode, createNode("b", "", value));
  }

  function appendPlanRow(parent, label, value, title = "") {
    const row = createNode("div");
    const labelNode = createNode("span", "", label);
    if (title) {
      labelNode.title = title;
    }
    row.append(labelNode, createNode("b", "", value));
    parent.append(row);
  }

  function runSafely(task) {
    Promise.resolve()
      .then(task)
      .catch((error) => {
        renderError("Ikny 실행 중 문제가 생겼습니다.", error.message || "페이지를 새로고침해 주세요.");
      });
  }

  function makeDraggable(target, handle) {
    let startX = 0;
    let startY = 0;
    let baseX = 0;
    let baseY = 0;
    handle.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) {
        return;
      }
      const rect = target.getBoundingClientRect();
      startX = event.clientX;
      startY = event.clientY;
      baseX = rect.left;
      baseY = rect.top;
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener("pointermove", (event) => {
      if (!handle.hasPointerCapture(event.pointerId)) {
        return;
      }
      target.style.left = `${baseX + event.clientX - startX}px`;
      target.style.top = `${baseY + event.clientY - startY}px`;
      target.style.right = "auto";
    });
  }

  function observeUrlChanges(callback) {
    let previous = location.href;
    window.setInterval(() => {
      if (location.href !== previous) {
        previous = location.href;
        callback();
      }
    }, 1000);
  }

  function average(values) {
    const usable = values.filter(Number.isFinite);
    return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : 0;
  }

  function ema(values, span) {
    const alpha = 2 / (span + 1);
    const output = [];
    values.forEach((value, index) => {
      output[index] = index === 0 ? value : value * alpha + output[index - 1] * (1 - alpha);
    });
    return output;
  }

  function rsi(values, period) {
    const changes = values.slice(1).map((value, index) => value - values[index]);
    const recent = changes.slice(-period);
    const gains = recent.map((value) => Math.max(value, 0));
    const losses = recent.map((value) => Math.max(-value, 0));
    const avgLoss = average(losses);
    if (avgLoss === 0) {
      return 50;
    }
    const rs = average(gains) / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  function atr(high, low, close, period) {
    const ranges = high.map((value, index) => {
      const previousClose = close[index - 1] ?? close[index];
      return Math.max(value - low[index], Math.abs(value - previousClose), Math.abs(low[index] - previousClose));
    });
    return average(ranges.slice(-period));
  }

  function std(values) {
    const mean = average(values);
    return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
  }

  function last(values) {
    return values[values.length - 1] || 0;
  }

  function textMatch(text, regex) {
    return String(text || "").match(regex)?.[1] || "";
  }

  function findGoogleFinanceSymbol(text) {
    const match = String(text || "").match(/\b([A-Z][A-Z0-9.]{0,9})\s*[:：]\s*(NASDAQ|NYSE|NYSEARCA|AMEX|OTCMKTS|LON|TSE|TYO|KRX|KOSDAQ)\b/i);
    if (!match) {
      return "";
    }
    return `${match[1]}:${match[2]}`;
  }

  function safeDecode(value) {
    try {
      return decodeURIComponent(value);
    } catch (_error) {
      return String(value || "");
    }
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function formatSigned(value) {
    return `${value >= 0 ? "+" : ""}${Number(value || 0).toFixed(2)}`;
  }

  function scoreGuide(score) {
    if (score >= 80) {
      return "매수 쪽 신호가 강합니다";
    }
    if (score >= 65) {
      return "매수 쪽이 조금 더 유리합니다";
    }
    if (score <= 20) {
      return "매도 쪽 신호가 강합니다";
    }
    if (score <= 35) {
      return "매도 쪽이 조금 더 유리합니다";
    }
    return "뚜렷한 방향이 약합니다";
  }

  function plainSummary(analysis) {
    if (analysis.opinionScore >= 65) {
      return "지금은 오를 가능성을 보는 신호가 더 많습니다. 다만 손실 제한선을 정하고 접근하는 구간입니다.";
    }
    if (analysis.opinionScore <= 35) {
      return "지금은 빠질 가능성을 보는 신호가 더 많습니다. 신규 매수는 서두르지 않는 쪽이 낫습니다.";
    }
    return "매수와 매도 신호가 섞여 있습니다. 방향이 더 분명해질 때까지 지켜보는 구간입니다.";
  }

  function buildWeeklyForecast(analysis) {
    const closeToResistance = analysis.resistance > 0 ? (analysis.resistance - analysis.latestClose) / analysis.latestClose * 100 : 0;
    const closeToSupport = analysis.latestClose > 0 ? (analysis.latestClose - analysis.support) / analysis.latestClose * 100 : 0;
    const highVolatility = analysis.volatility20 >= 45;

    if (analysis.opinionScore >= 75) {
      return highVolatility
        ? "상승 시도는 가능하지만 변동폭이 커서 중간 흔들림을 감안해야 합니다."
        : "상승 흐름이 이어질 가능성이 조금 더 높아 보입니다.";
    }
    if (analysis.opinionScore >= 60) {
      return closeToResistance < 3
        ? "소폭 상승 여지는 있지만 위쪽 가격대에서 막힐 수 있습니다."
        : "완만한 상승 또는 횡보 쪽 가능성이 더 높아 보입니다.";
    }
    if (analysis.opinionScore <= 25) {
      return highVolatility
        ? "하락 압력이 강하고 변동도 커서 보수적으로 보는 구간입니다."
        : "약세가 이어질 가능성이 조금 더 높아 보입니다.";
    }
    if (analysis.opinionScore <= 40) {
      return closeToSupport < 3
        ? "아래 가격대가 가까워 반등 시도는 가능하지만 흐름은 약합니다."
        : "약한 하락 또는 횡보 쪽 가능성이 더 높아 보입니다.";
    }
    if (analysis.rsi14 > 68) {
      return "단기 과열이 있어 쉬어가거나 흔들릴 가능성이 있습니다.";
    }
    if (analysis.rsi14 < 32) {
      return "많이 빠진 구간이라 기술적 반등 가능성은 열려 있습니다.";
    }
    return "뚜렷한 방향 신호가 약해 횡보 가능성이 커 보입니다.";
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }
})();
