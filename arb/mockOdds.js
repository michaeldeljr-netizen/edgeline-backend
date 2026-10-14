// Mock events in The Odds API v4 shape (decimal odds), used when no
// ODDS_API_KEY is set. Contains one moneyline arb and one totals arb so the
// endpoint has something to show; the spread market is deliberately not an arb.

function mockEvents() {
  const now = Date.now();
  const inHours = (h) => new Date(now + h * 3600 * 1000).toISOString();
  const fresh = new Date(now - 30 * 1000).toISOString();

  const book = (key, title, markets) => ({ key, title, last_update: fresh, markets });
  const h2h = (home, away, hp, ap) => ({
    key: "h2h",
    last_update: fresh,
    outcomes: [
      { name: home, price: hp },
      { name: away, price: ap },
    ],
  });
  const spreads = (home, away, pt, hp, ap) => ({
    key: "spreads",
    last_update: fresh,
    outcomes: [
      { name: home, price: hp, point: pt },
      { name: away, price: ap, point: -pt },
    ],
  });
  const totals = (pt, op, up) => ({
    key: "totals",
    last_update: fresh,
    outcomes: [
      { name: "Over", price: op, point: pt },
      { name: "Under", price: up, point: pt },
    ],
  });

  return [
    {
      id: "mock-nfl-1",
      sport_key: "americanfootball_nfl",
      sport_title: "NFL",
      commence_time: inHours(26),
      home_team: "New York Giants",
      away_team: "Philadelphia Eagles",
      bookmakers: [
        book("draftkings", "DraftKings", [
          h2h("New York Giants", "Philadelphia Eagles", 3.4, 1.33),
          spreads("New York Giants", "Philadelphia Eagles", 7.5, 1.91, 1.91),
          totals(44.5, 1.87, 1.95),
        ]),
        book("fanduel", "FanDuel", [
          h2h("New York Giants", "Philadelphia Eagles", 3.25, 1.36),
          spreads("New York Giants", "Philadelphia Eagles", 7.5, 1.89, 1.93),
          totals(44.5, 2.12, 1.74),
        ]),
        book("betmgm", "BetMGM", [
          h2h("New York Giants", "Philadelphia Eagles", 3.1, 1.43),
          spreads("New York Giants", "Philadelphia Eagles", 7.5, 1.91, 1.91),
          totals(44.5, 1.91, 1.91),
        ]),
      ],
    },
    {
      id: "mock-nhl-1",
      sport_key: "icehockey_nhl",
      sport_title: "NHL",
      commence_time: inHours(6),
      home_team: "New Jersey Devils",
      away_team: "New York Rangers",
      bookmakers: [
        book("williamhill_us", "Caesars", [
          h2h("New Jersey Devils", "New York Rangers", 1.83, 2.0),
          totals(6.0, 1.95, 1.87),
        ]),
        book("fanatics", "Fanatics", [
          h2h("New Jersey Devils", "New York Rangers", 1.8, 2.05),
          totals(6.0, 1.91, 1.91),
        ]),
      ],
    },
  ];
}

module.exports = { mockEvents };
