/**
 * diagnose.js
 * Run this FIRST to find the real CSS selectors on each site.
 * Usage: node diagnose.js
 */

require("dotenv").config();
const axios = require("axios");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const KEYWORD = "fever"; // test keyword

// ── Axios client ─────────────────────────────────────────────────────────────
const client = axios.create({
  timeout: 20000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  },
});

// ── Save raw HTML to file so you can open it in browser ──────────────────────
function saveHTML(name, html) {
  const file = path.join(__dirname, `${name}-raw.html`);
  fs.writeFileSync(file, html, "utf-8");
  console.log(`  💾 Raw HTML saved → ${file}  (open in browser to inspect)\n`);
}

// ── Print first 30 unique class names found in the document ──────────────────
function dumpClasses($) {
  const classes = new Set();
  $("[class]").each((i, el) => {
    const cls = $(el).attr("class") || "";
    cls.split(/\s+/).forEach((c) => {
      if (c && c.length > 2) classes.add(c);
    });
  });
  const list = [...classes].slice(0, 40);
  console.log("  📋 First 40 CSS classes found on page:");
  list.forEach((c) => console.log(`     .${c}`));
  console.log();
}

// ── Try a list of candidate selectors and report which ones match ─────────────
function trySelectors($, selectors) {
  console.log("  🔍 Selector probe results:");
  selectors.forEach((sel) => {
    const count = $(sel).length;
    if (count > 0) {
      console.log(`     ✅ "${sel}" → ${count} elements found`);
      // Print first match's text snippet
      const snippet = $(sel).first().text().replace(/\s+/g, " ").trim().slice(0, 120);
      console.log(`        Sample: "${snippet}"`);
    } else {
      console.log(`     ❌ "${sel}" → 0 elements`);
    }
  });
  console.log();
}

// ════════════════════════════════════════════════════════════════════════════
//  1. PUBMED
// ════════════════════════════════════════════════════════════════════════════
async function diagnosePubMed() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔬 PUBMED DIAGNOSIS");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const url = `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(KEYWORD)}&format=abstract`;
  console.log(`  Fetching: ${url}\n`);

  try {
    const res = await client.get(url);
    const $ = cheerio.load(res.data);
    saveHTML("pubmed", res.data);
    dumpClasses($);

    trySelectors($, [
      "article.full-docsum",
      "article",
      ".docsum-content",
      ".search-results-chunk article",
      "[data-article-id]",
      ".results-article",
      "li.search-results-chunk",
      "#search-results article",
      ".docsum-wrap",
    ]);

    // Also try to find any <article> and print its classes
    console.log("  📄 All <article> elements and their classes:");
    $("article").each((i, el) => {
      if (i < 5) {
        console.log(`     article[${i}] classes: "${$(el).attr("class")}"`);
        console.log(`     article[${i}] data-article-id: "${$(el).attr("data-article-id")}"`);
      }
    });
    console.log();
  } catch (err) {
    console.log(`  ❌ Error: ${err.message}\n`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  2. MEDLINEPLUS
// ════════════════════════════════════════════════════════════════════════════
async function diagnoseMedline() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("💊 MEDLINEPLUS DIAGNOSIS");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const url = `https://medlineplus.gov/search/?query=${encodeURIComponent(KEYWORD)}`;
  console.log(`  Fetching: ${url}\n`);

  try {
    const res = await client.get(url);
    const $ = cheerio.load(res.data);
    saveHTML("medline", res.data);
    dumpClasses($);

    trySelectors($, [
      "ul.search-results-list li",
      ".search-result-item",
      ".search-results li",
      ".result",
      "#search-results li",
      "ul.results li",
      ".search-result",
      "li.result",
      ".ui-search-result",
      "section.results li",
      "[class*='result']",
    ]);

    // Print all <ul> and <li> class names found
    console.log("  📄 First 5 <li> elements and their classes:");
    $("li").each((i, el) => {
      if (i < 5) {
        console.log(`     li[${i}] classes: "${$(el).attr("class")}"`);
        const firstA = $(el).find("a").first();
        console.log(`     li[${i}] first-a: "${firstA.text().trim().slice(0, 80)}"`);
      }
    });
    console.log();
  } catch (err) {
    console.log(`  ❌ Error: ${err.message}\n`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  3. WHO  (Puppeteer — waits for JS render)
// ════════════════════════════════════════════════════════════════════════════
async function diagnoseWHO() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🌍 WHO DIAGNOSIS  (headless Chrome)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const url = `https://www.who.int/search?query=${encodeURIComponent(KEYWORD)}`;
  console.log(`  Fetching via Puppeteer: ${url}\n`);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise((r) => setTimeout(r, 4000)); // extra wait for React render

    const html = await page.content();
    const $ = cheerio.load(html);
    saveHTML("who", html);
    dumpClasses($);

    trySelectors($, [
      ".sf-search-result",
      ".search-result",
      "li.list-view--item",
      "[class*='result-item']",
      "[class*='search-result']",
      "[class*='SearchResult']",
      "article",
      ".sf-result",
      ".results-list li",
      "ul.results li",
      ".content-list li",
    ]);

    console.log("  📄 First 5 elements with 'result' in class name:");
    $("[class*='result'], [class*='Result']").each((i, el) => {
      if (i < 5) {
        console.log(`     [${i}] tag: <${el.name}> classes: "${$(el).attr("class")}"`);
        const text = $(el).text().replace(/\s+/g, " ").trim().slice(0, 100);
        console.log(`         text: "${text}"`);
      }
    });
    console.log();
  } catch (err) {
    console.log(`  ❌ Error: ${err.message}\n`);
  } finally {
    if (browser) await browser.close();
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  MAIN
// ════════════════════════════════════════════════════════════════════════════
(async () => {
  console.log("\n🏥 MEDICAL SCRAPER — SELECTOR DIAGNOSTIC TOOL");
  console.log(`   Keyword used for testing: "${KEYWORD}"\n`);

  await diagnosePubMed();
  await diagnoseMedline();
  await diagnoseWHO();

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ DIAGNOSIS COMPLETE");
  console.log("");
  console.log("NEXT STEPS:");
  console.log("  1. Look for ✅ lines above — those are working selectors");
  console.log("  2. Open the saved *-raw.html files in your browser");
  console.log("  3. Use browser DevTools (F12) to inspect result items");
  console.log("  4. Update the selectors in your scraper files accordingly");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
})();
