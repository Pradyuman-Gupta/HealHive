/**
 * Deduplicate results by URL and normalize/clean all fields.
 *
 * @param {Array} results - Filtered results
 * @returns {Array} Clean, deduplicated results
 */
function formatAndDeduplicate(results) {
  const seen = new Set();
  const formatted = [];

  for (const item of results) {
    // Skip items with missing or duplicate URLs
    if (!item.url || item.url === "N/A" || seen.has(item.url)) continue;
    seen.add(item.url);

    formatted.push({
      title: cleanText(item.title),
      url: item.url,
      summary: cleanText(item.summary),
      source: item.source,
      type: item.type,
      matchedKeywords: item.matchedKeywords || [],
      scrapedAt: item.scrapedAt,
    });
  }

  // Sort: research papers first, then by source name
  formatted.sort((a, b) => {
    if (a.type === "research_paper" && b.type !== "research_paper") return -1;
    if (a.type !== "research_paper" && b.type === "research_paper") return 1;
    return a.source.localeCompare(b.source);
  });

  return formatted;
}

// ── Strip excess whitespace and newlines from text ───────────────────────────
function cleanText(text) {
  if (!text || text === "N/A") return "N/A";
  return text.replace(/\s+/g, " ").trim();
}

module.exports = { formatAndDeduplicate };