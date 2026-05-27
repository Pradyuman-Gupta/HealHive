const { MATCH_MODE } = require("../config/keywords");

/**
 * Filter scraped results so only those containing the target keywords
 * (in title OR summary) are kept. Also updates matchedKeywords on each result.
 *
 * @param {Array}  results  - Raw results from scrapers
 * @param {Array}  keywords - Keywords to match against
 * @returns {Array} Filtered results
 */
function filterByKeywords(results, keywords) {
  const lowerKeywords = keywords.map((k) => k.toLowerCase());

  return results.filter((result) => {
    const text = `${result.title} ${result.summary}`.toLowerCase();

    if (MATCH_MODE === "all") {
      // Every keyword must appear
      const allMatch = lowerKeywords.every((kw) => text.includes(kw));
      if (allMatch) result.matchedKeywords = [...lowerKeywords];
      return allMatch;
    } else {
      // At least one keyword must appear
      const matched = lowerKeywords.filter((kw) => text.includes(kw));
      if (matched.length > 0) {
        result.matchedKeywords = matched;
        return true;
      }
      return false;
    }
  });
}

module.exports = { filterByKeywords };