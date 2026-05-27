const axios = require("axios");
const axiosRetry = require("axios-retry"); // v3 — no .default needed
const Bottleneck = require("bottleneck");

// ── Rate limiter ────────────────────────────────────────────────────────────
// 500ms between requests, max 2 concurrent — respectful to servers
const limiter = new Bottleneck({
  minTime: 500,
  maxConcurrent: 2,
});

// ── Axios instance ──────────────────────────────────────────────────────────
const client = axios.create({
  timeout: 20000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    Connection: "keep-alive",
    "Upgrade-Insecure-Requests": "1",
  },
});

// ── Auto-retry on network errors and 5xx (up to 3 times, exponential backoff)
axiosRetry(client, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) =>
    axiosRetry.isNetworkOrIdempotentRequestError(error) ||
    (error.response && error.response.status >= 500),
  onRetry: (retryCount, error) => {
    const logger = require("./logger");
    logger.warn(`Retry #${retryCount} for ${error.config?.url} — ${error.message}`);
  },
});

// ── Rate-limited GET ────────────────────────────────────────────────────────
const get = (url, config = {}) =>
  limiter.schedule(() => client.get(url, config));

module.exports = { get };