chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "IKNY_FETCH_CHART") {
    return false;
  }

  fetchFirstAvailable(message.candidates || [])
    .then((payload) => sendResponse({ ok: true, payload }))
    .catch((error) => sendResponse({ ok: false, error: String(error.message || error) }));

  return true;
});

async function fetchFirstAvailable(candidates) {
  const unique = [...new Set(candidates.map((item) => String(item || "").trim()).filter(Boolean))];
  let lastError = null;

  for (const symbol of unique) {
    try {
      const payload = await fetchYahooChart(symbol);
      if (payload.rows.length >= 60) {
        return payload;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("No usable ticker candidates found.");
}

async function fetchYahooChart(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${symbol}: Yahoo chart request failed (${response.status})`);
  }

  const data = await response.json();
  const result = data?.chart?.result?.[0];
  if (!result || data?.chart?.error) {
    throw new Error(`${symbol}: Yahoo chart returned no data.`);
  }

  const quote = result.indicators?.quote?.[0] || {};
  const rows = (result.timestamp || [])
    .map((timestamp, index) => ({
      date: new Date(timestamp * 1000).toISOString().slice(0, 10),
      open: quote.open?.[index],
      high: quote.high?.[index],
      low: quote.low?.[index],
      close: quote.close?.[index],
      volume: quote.volume?.[index]
    }))
    .filter((row) => Number.isFinite(row.close) && Number.isFinite(row.high) && Number.isFinite(row.low));

  return {
    symbol: result.meta?.symbol || symbol,
    currency: result.meta?.currency || "",
    exchangeName: result.meta?.exchangeName || "",
    regularMarketPrice: result.meta?.regularMarketPrice,
    rows
  };
}
