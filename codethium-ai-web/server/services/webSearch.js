const config = require('../config');

const TRIGGER_KEYWORDS = [
  // time signals
  'today', 'now', 'current', 'currently', 'latest', 'recent', 'recently',
  'right now', 'at the moment', 'this week', 'this month', 'this year',
  'tomorrow', 'yesterday', 'live', 'real-time', 'realtime',
  // real-time categories
  'weather', 'forecast', 'temperature', 'rain', 'sunny', 'humidity',
  'news', 'breaking', 'headline',
  'price', 'stock', 'crypto', 'bitcoin', 'exchange rate',
  'score', 'match result', 'standings',
  'traffic', 'flight', 'departure', 'arrival',
];

/**
 * Returns true if the query likely requires real-time web data.
 * Always returns false when TAVILY_API_KEY is not configured.
 * @param {string} query
 * @returns {boolean}
 */
function needsWebSearch(query) {
  if (!config.TAVILY_API_KEY) return false;
  const q = query.toLowerCase();
  return TRIGGER_KEYWORDS.some(kw => q.includes(kw));
}

/**
 * Search the web via Tavily and return structured results.
 * @param {string} query
 * @param {number} [maxResults=5]
 * @returns {Promise<Array<{title: string, url: string, snippet: string}>>}
 */
async function searchWeb(query, maxResults = 5) {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: config.TAVILY_API_KEY,
      query,
      search_depth: 'basic',
      max_results: maxResults,
    }),
  });
  if (!res.ok) throw new Error(`Tavily error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.results || []).map(r => ({
    title: r.title,
    url: r.url,
    snippet: r.content,
  }));
}

module.exports = { needsWebSearch, searchWeb };
