// Pure arbitrage math — no network, no env. Takes events in The Odds API v4
// shape (decimal odds) and returns every line where the best price on each
// side, across books, sums to less than 100% implied probability.

function decimalToAmerican(d) {
  if (d >= 2) return `+${Math.round((d - 1) * 100)}`;
  return `${Math.round(-100 / (d - 1))}`;
}

// Outcomes on the same "line" must be bet together to cover every result.
// Moneyline: one line per market. Spreads: keyed by the home team's point,
// so home -3.5 pairs with away +3.5. Totals: Over/Under share the point.
function lineKey(marketKey, outcome, event) {
  if (marketKey === "spreads") {
    const homePoint = outcome.name === event.home_team ? outcome.point : -outcome.point;
    return String(homePoint);
  }
  if (marketKey === "totals") return String(outcome.point);
  return "ml";
}

function describeLine(marketKey, line, event) {
  if (marketKey === "spreads") {
    const p = Number(line);
    return `${event.home_team} ${p > 0 ? "+" : ""}${p} / ${event.away_team} ${-p > 0 ? "+" : ""}${-p}`;
  }
  if (marketKey === "totals") return `Total ${line}`;
  return "Moneyline";
}

// Split `bankroll` so every outcome pays the same. Also returns a version
// rounded to `roundTo` dollars, since odd-cent stakes are a tell to books.
function computeStakes(legs, bankroll, roundTo = 1) {
  const sumImplied = legs.reduce((s, l) => s + 1 / l.price, 0);
  const exact = legs.map((l) => bankroll / (l.price * sumImplied));
  const rounded = exact.map((s) => Math.max(roundTo, Math.round(s / roundTo) * roundTo));
  const roundedTotal = rounded.reduce((a, b) => a + b, 0);
  const worstPayout = Math.min(...rounded.map((s, i) => s * legs[i].price));
  return {
    exact: exact.map((s) => +s.toFixed(2)),
    exactProfit: +(bankroll / sumImplied - bankroll).toFixed(2),
    rounded,
    roundedTotal,
    roundedWorstProfit: +(worstPayout - roundedTotal).toFixed(2),
  };
}

function findArbsInEvent(event, opts = {}) {
  const {
    now = Date.now(),
    minProfitPct = 0,
    maxProfitPct = 15,
    maxOddsAgeSec = 600,
    bankroll = 100,
    roundTo = 1,
    bookNames = {},
  } = opts;

  // Pre-market only.
  if (new Date(event.commence_time).getTime() <= now) return [];

  // markets[marketKey][line][outcomeName] = best leg seen so far
  const markets = {};
  // Every outcome name seen per market, so a 3-way moneyline needs the Draw.
  const namesByMarket = {};

  for (const book of event.bookmakers || []) {
    for (const market of book.markets || []) {
      const updated = new Date(market.last_update || book.last_update).getTime();
      if (maxOddsAgeSec && now - updated > maxOddsAgeSec * 1000) continue;

      namesByMarket[market.key] ??= new Set();
      for (const o of market.outcomes || []) {
        if (!(o.price > 1)) continue;
        namesByMarket[market.key].add(o.name);
        const line = lineKey(market.key, o, event);
        const slot = ((markets[market.key] ??= {})[line] ??= {});
        if (!slot[o.name] || o.price > slot[o.name].price) {
          slot[o.name] = {
            outcome: o.name,
            point: o.point ?? null,
            price: o.price,
            american: decimalToAmerican(o.price),
            book: book.key,
            bookTitle: bookNames[book.key] || book.title,
            lastUpdate: market.last_update || book.last_update,
          };
        }
      }
    }
  }

  const arbs = [];
  for (const [marketKey, lines] of Object.entries(markets)) {
    const needed = marketKey === "spreads" || marketKey === "totals" ? 2 : namesByMarket[marketKey].size;
    for (const [line, slot] of Object.entries(lines)) {
      const legs = Object.values(slot);
      if (legs.length < 2 || legs.length !== needed) continue;

      const impliedSum = legs.reduce((s, l) => s + 1 / l.price, 0);
      const profitPct = (1 / impliedSum - 1) * 100;
      if (profitPct <= minProfitPct || profitPct > maxProfitPct) continue;

      arbs.push({
        eventId: event.id,
        sport: event.sport_key,
        sportTitle: event.sport_title,
        commenceTime: event.commence_time,
        matchup: `${event.away_team} @ ${event.home_team}`,
        market: marketKey,
        line: describeLine(marketKey, line, event),
        profitPct: +profitPct.toFixed(2),
        impliedSum: +impliedSum.toFixed(4),
        legs,
        stakes: computeStakes(legs, bankroll, roundTo),
      });
    }
  }
  return arbs;
}

function findArbs(events, opts = {}) {
  return events
    .flatMap((e) => findArbsInEvent(e, opts))
    .sort((a, b) => b.profitPct - a.profitPct);
}

module.exports = { findArbs, findArbsInEvent, computeStakes, decimalToAmerican };
