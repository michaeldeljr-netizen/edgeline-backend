// Fetches pre-market odds for NJ books from The Odds API and runs the arb
// engine over them. Needs ODDS_API_KEY (free tier: the-odds-api.com); without
// one it serves mock events so the endpoint still works locally.
//
// Quota: each sport costs (number of markets) credits per refresh, since all
// NJ books fit in one 10-bookmaker "region". 5 sports x 3 markets = 15 credits
// per uncached scan. Results are cached for ARB_CACHE_TTL_SEC (default 120s).

const { NJ_BOOKS, getBookKeys } = require("./books");
const { findArbs } = require("./engine");
const { mockEvents } = require("./mockOdds");

const ODDS_BASE = "https://api.the-odds-api.com/v4";
const DEFAULT_SPORTS = [
  "americanfootball_nfl",
  "americanfootball_ncaaf",
  "basketball_nba",
  "baseball_mlb",
  "icehockey_nhl",
];
const DEFAULT_MARKETS = ["h2h", "spreads", "totals"];

const cache = new Map(); // sport|markets|books -> { at, events }
let lastQuota = null;

function cacheTtlMs() {
  return Number(process.env.ARB_CACHE_TTL_SEC || 120) * 1000;
}

// The Odds API rejects fractional seconds in commenceTimeFrom.
function isoNoMillis(ms) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

async function getJson(url) {
  const res = await fetch(url);
  const remaining = res.headers.get("x-requests-remaining");
  if (remaining != null) {
    lastQuota = { remaining: Number(remaining), used: Number(res.headers.get("x-requests-used")) };
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Odds API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// /sports is free (doesn't count against quota) — use it to skip off-season sports.
async function activeSports(apiKey, wanted) {
  const all = await getJson(`${ODDS_BASE}/sports?apiKey=${apiKey}`);
  const active = new Set(all.filter((s) => s.active).map((s) => s.key));
  return wanted.filter((s) => active.has(s));
}

async function fetchSportOdds(apiKey, sport, markets, books) {
  const key = `${sport}|${markets.join(",")}|${books.join(",")}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < cacheTtlMs()) return hit.events;

  const params = new URLSearchParams({
    apiKey,
    markets: markets.join(","),
    bookmakers: books.join(","),
    oddsFormat: "decimal",
    commenceTimeFrom: isoNoMillis(Date.now()),
  });
  const events = await getJson(`${ODDS_BASE}/sports/${sport}/odds?${params}`);
  cache.set(key, { at: Date.now(), events });
  return events;
}

async function scan(options = {}) {
  const apiKey = process.env.ODDS_API_KEY;
  const books = options.books?.length ? options.books : getBookKeys();
  const markets = options.markets?.length ? options.markets : DEFAULT_MARKETS;
  const wantedSports = options.sports?.length ? options.sports : DEFAULT_SPORTS;
  const engineOpts = {
    minProfitPct: options.minProfitPct ?? Number(process.env.ARB_MIN_PROFIT_PCT || 0),
    maxProfitPct: options.maxProfitPct ?? Number(process.env.ARB_MAX_PROFIT_PCT || 15),
    maxOddsAgeSec: options.maxOddsAgeSec ?? Number(process.env.ARB_MAX_ODDS_AGE_SEC || 600),
    bankroll: options.bankroll ?? 100,
    roundTo: options.roundTo ?? 1,
    bookNames: NJ_BOOKS,
  };

  if (!apiKey) {
    const events = mockEvents().filter((e) => books.some((b) => e.bookmakers.some((bm) => bm.key === b)));
    return {
      source: "mock",
      scannedAt: new Date().toISOString(),
      sports: [...new Set(events.map((e) => e.sport_key))],
      books,
      eventsScanned: events.length,
      errors: [],
      quota: null,
      arbs: findArbs(events, engineOpts),
    };
  }

  const sports = await activeSports(apiKey, wantedSports);
  const errors = [];
  const results = await Promise.all(
    sports.map((s) =>
      fetchSportOdds(apiKey, s, markets, books).catch((err) => {
        errors.push({ sport: s, error: err.message });
        return [];
      })
    )
  );
  const events = results.flat();

  return {
    source: "the-odds-api",
    scannedAt: new Date().toISOString(),
    sports,
    books,
    eventsScanned: events.length,
    errors,
    quota: lastQuota,
    arbs: findArbs(events, engineOpts),
  };
}

module.exports = { scan, DEFAULT_SPORTS, DEFAULT_MARKETS };
