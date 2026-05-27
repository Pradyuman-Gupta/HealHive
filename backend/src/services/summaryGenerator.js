/**
 * Generates a concise 2-3 line AI summary from scraper results.
 * Used to build the consultation message payload sent to doctors.
 */

/**
 * Takes raw scraper results and produces a short summary string.
 * @param {Array}  results  - Formatted scraper results
 * @param {Array}  keywords - Original user keywords
 * @returns {string} 2-3 line summary
 */
function generateSummary(results = [], keywords = []) {
  if (results.length === 0) {
    return `No specific medical data found for the symptoms: ${keywords.join(", ")}. ` +
      `Patient reports these symptoms and is seeking professional medical advice.`;
  }

  // Group results by source
  const bySource = {};
  for (const r of results) {
    if (!bySource[r.source]) bySource[r.source] = [];
    bySource[r.source].push(r);
  }

  const sourceNames = Object.keys(bySource);
  const totalResults = results.length;

  // Pick the top 2 most relevant titles
  const topTitles = results
    .slice(0, 2)
    .map((r) => r.title)
    .filter((t) => t && t !== "N/A")
    .join("; ");

  // Build the 2-3 line summary
  const lines = [];

  // Line 1: What was searched and found
  lines.push(
    `AI analysis based on symptoms: "${keywords.join(", ")}". ` +
    `Found ${totalResults} relevant result(s) across ${sourceNames.join(", ")}.`
  );

  // Line 2: Top findings
  if (topTitles) {
    lines.push(`Key findings include: ${topTitles}.`);
  }

  // Line 3: Note about needing professional review
  lines.push(
    `These results are AI-aggregated from medical databases and require professional review.`
  );

  return lines.join(" ");
}

/**
 * Builds the full consultation payload sent to the doctor board.
 */
function buildConsultationPayload(keywords, scraperResults) {
  const summary = generateSummary(scraperResults, keywords);

  return {
    keywords,
    aiSummary: summary,
    resultCount: scraperResults.length,
    sources: [...new Set(scraperResults.map((r) => r.source))],
  };
}

module.exports = { generateSummary, buildConsultationPayload };