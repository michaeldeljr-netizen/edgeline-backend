// NJ-licensed sportsbooks, keyed by The Odds API bookmaker keys.
// https://the-odds-api.com/sports-odds-data/bookmaker-apis.html
//
// Books come and go (and rebrand), so override the list without a code change:
//   NJ_BOOKS=draftkings,fanduel,betmgm
// Keep it at 10 or fewer: The Odds API bills every 10 bookmakers as one region.
const NJ_BOOKS = {
  draftkings: "DraftKings",
  fanduel: "FanDuel",
  betmgm: "BetMGM",
  williamhill_us: "Caesars",
  betrivers: "BetRivers",
  espnbet: "ESPN BET / theScore Bet",
  fanatics: "Fanatics",
  hardrockbet: "Hard Rock Bet",
  betparx: "betPARX",
};

function getBookKeys() {
  const fromEnv = (process.env.NJ_BOOKS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return fromEnv.length > 0 ? fromEnv : Object.keys(NJ_BOOKS);
}

module.exports = { NJ_BOOKS, getBookKeys };
