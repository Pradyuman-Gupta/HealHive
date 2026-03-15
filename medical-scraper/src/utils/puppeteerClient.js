const logger = require("./logger");

let browser = null;

// ── Launch a shared browser instance (reused across requests) ───────────────
async function getBrowser() {
  if (browser && browser.isConnected()) return browser;

  const puppeteer = require("puppeteer");
  browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
    ],
  });

  logger.info("[Puppeteer] Browser launched");
  return browser;
}

// ── Fetch a page via headless Chrome and return HTML ────────────────────────
async function fetchWithPuppeteer(url, waitMs = 3000) {
  const b = await getBrowser();
  const page = await b.newPage();

  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });

    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

    // Extra wait for JS-heavy pages (Cloudflare challenge etc.)
    await new Promise((r) => setTimeout(r, waitMs));

    const html = await page.content();
    return html;
  } catch (err) {
    logger.error(`[Puppeteer] Failed to fetch ${url}: ${err.message}`);
    return null;
  } finally {
    await page.close();
  }
}

// ── Graceful shutdown ────────────────────────────────────────────────────────
async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
    logger.info("[Puppeteer] Browser closed");
  }
}

module.exports = { fetchWithPuppeteer, closeBrowser };