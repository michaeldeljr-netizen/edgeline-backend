const test = require("node:test");
const assert = require("node:assert");
const { findArbs, computeStakes, decimalToAmerican } = require("../arb/engine");

const NOW = Date.parse("2026-10-14T12:00:00Z");
const fresh = "2026-10-14T11:59:00Z";

function event(bookmakers, overrides = {}) {
  return {
    id: "e1",
    sport_key: "basketball_nba",
    sport_title: "NBA",
    commence_time: "2026-10-14T23:00:00Z",
    home_team: "Home",
    away_team: "Away",
    bookmakers,
    ...overrides,
  };
}
const bk = (key, markets, last_update = fresh) => ({ key, title: key, last_update, markets });
const mkt = (key, outcomes, last_update = fresh) => ({ key, last_update, outcomes });

test("finds a two-way moneyline arb across books", () => {
  const ev = event([
    bk("a", [mkt("h2h", [{ name: "Home", price: 2.1 }, { name: "Away", price: 1.8 }])]),
    bk("b", [mkt("h2h", [{ name: "Home", price: 1.8 }, { name: "Away", price: 2.1 }])]),
  ]);
  const [arb] = findArbs([ev], { now: NOW });
  assert.ok(arb);
  assert.deepStrictEqual(arb.legs.map((l) => l.book).sort(), ["a", "b"]);
  assert.strictEqual(arb.profitPct, 5);
});

test("ignores markets with no arb", () => {
  const ev = event([bk("a", [mkt("h2h", [{ name: "Home", price: 1.91 }, { name: "Away", price: 1.91 }])])]);
  assert.strictEqual(findArbs([ev], { now: NOW }).length, 0);
});

test("skips events that have already started", () => {
  const ev = event(
    [
      bk("a", [mkt("h2h", [{ name: "Home", price: 2.1 }, { name: "Away", price: 1.8 }])]),
      bk("b", [mkt("h2h", [{ name: "Home", price: 1.8 }, { name: "Away", price: 2.1 }])]),
    ],
    { commence_time: "2026-10-14T11:00:00Z" }
  );
  assert.strictEqual(findArbs([ev], { now: NOW }).length, 0);
});

test("skips stale odds", () => {
  const stale = "2026-10-14T10:00:00Z";
  const ev = event([
    bk("a", [mkt("h2h", [{ name: "Home", price: 2.1 }, { name: "Away", price: 1.8 }], stale)], stale),
    bk("b", [mkt("h2h", [{ name: "Home", price: 1.8 }, { name: "Away", price: 2.1 }])]),
  ]);
  assert.strictEqual(findArbs([ev], { now: NOW, maxOddsAgeSec: 600 }).length, 0);
});

test("three-way moneyline requires the draw to be covered", () => {
  const ev = event([
    bk("a", [mkt("h2h", [{ name: "Home", price: 3.5 }, { name: "Away", price: 3.5 }, { name: "Draw", price: 3.0 }])]),
    bk("b", [mkt("h2h", [{ name: "Home", price: 3.6 }, { name: "Away", price: 3.6 }])]),
  ]);
  const [arb] = findArbs([ev], { now: NOW });
  assert.strictEqual(arb.legs.length, 3);
  assert.ok(arb.legs.some((l) => l.outcome === "Draw"));
});

test("spreads only pair opposite points", () => {
  const ev = event([
    bk("a", [mkt("spreads", [{ name: "Home", price: 2.1, point: -3.5 }, { name: "Away", price: 1.75, point: 3.5 }])]),
    // Away +2.5 at a big price must NOT pair with Home -3.5.
    bk("b", [mkt("spreads", [{ name: "Home", price: 1.6, point: -2.5 }, { name: "Away", price: 2.5, point: 2.5 }])]),
    bk("c", [mkt("spreads", [{ name: "Home", price: 1.7, point: -3.5 }, { name: "Away", price: 2.05, point: 3.5 }])]),
  ]);
  const arbs = findArbs([ev], { now: NOW });
  assert.strictEqual(arbs.length, 1);
  const legs = Object.fromEntries(arbs[0].legs.map((l) => [l.outcome, l]));
  assert.strictEqual(legs.Home.point, -3.5);
  assert.strictEqual(legs.Away.point, 3.5);
  assert.strictEqual(legs.Away.book, "c");
});

test("totals pair over and under at the same number", () => {
  const ev = event([
    bk("a", [mkt("totals", [{ name: "Over", price: 2.1, point: 220.5 }, { name: "Under", price: 1.75, point: 220.5 }])]),
    bk("b", [mkt("totals", [{ name: "Over", price: 1.7, point: 221.5 }, { name: "Under", price: 2.2, point: 221.5 }])]),
  ]);
  assert.strictEqual(findArbs([ev], { now: NOW }).length, 0);
});

test("drops implausibly large edges as likely bad data", () => {
  const ev = event([
    bk("a", [mkt("h2h", [{ name: "Home", price: 5 }, { name: "Away", price: 1.2 }])]),
    bk("b", [mkt("h2h", [{ name: "Home", price: 1.2 }, { name: "Away", price: 5 }])]),
  ]);
  assert.strictEqual(findArbs([ev], { now: NOW, maxProfitPct: 15 }).length, 0);
});

test("stakes equalize payout", () => {
  const s = computeStakes([{ price: 2.1 }, { price: 2.1 }], 100);
  assert.deepStrictEqual(s.exact, [50, 50]);
  assert.strictEqual(s.exactProfit, 5);
  assert.strictEqual(s.roundedWorstProfit, 5);
});

test("american odds conversion", () => {
  assert.strictEqual(decimalToAmerican(2.5), "+150");
  assert.strictEqual(decimalToAmerican(1.5), "-200");
  assert.strictEqual(decimalToAmerican(2.0), "+100");
});
