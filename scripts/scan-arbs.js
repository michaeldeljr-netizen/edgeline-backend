#!/usr/bin/env node
// Terminal arb scanner. Usage:
//   node scripts/scan-arbs.js [--bankroll 500] [--min 0.5] [--sports basketball_nba,icehockey_nhl]
//                             [--markets h2h,totals] [--books draftkings,fanduel] [--watch 120]
require("dotenv").config();
const { scan } = require("../arb/scanner");

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const list = (v) => (v ? v.split(",").map((s) => s.trim()) : undefined);
const num = (v) => (v === undefined ? undefined : Number(v));

const opts = {
  bankroll: num(arg("bankroll")) ?? 100,
  minProfitPct: num(arg("min")),
  sports: list(arg("sports")),
  markets: list(arg("markets")),
  books: list(arg("books")),
  roundTo: num(arg("round")),
};

function fmtTime(iso) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function runOnce() {
  const r = await scan(opts);
  console.log(
    `\n[${new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York" })} ET] ` +
      `source=${r.source} events=${r.eventsScanned} sports=${r.sports.join(",") || "none"}` +
      (r.quota ? ` quota_remaining=${r.quota.remaining}` : "")
  );
  for (const e of r.errors) console.log(`  ! ${e.sport}: ${e.error}`);
  if (r.arbs.length === 0) {
    console.log("  No pre-market arbs right now.");
    return;
  }
  for (const a of r.arbs) {
    console.log(`\n  ${a.profitPct.toFixed(2)}%  ${a.sportTitle}  ${a.matchup}  (${fmtTime(a.commenceTime)} ET)`);
    console.log(`  ${a.market} — ${a.line}`);
    a.legs.forEach((l, i) => {
      const pt = l.point != null && a.market !== "h2h" ? ` ${l.point > 0 && a.market === "spreads" ? "+" : ""}${l.point}` : "";
      console.log(
        `    ${(l.outcome + pt).padEnd(32)} ${l.american.padStart(5)} @ ${l.bookTitle.padEnd(24)} stake $${a.stakes.rounded[i]}`
      );
    });
    console.log(
      `    total $${a.stakes.roundedTotal} → guaranteed profit ≥ $${a.stakes.roundedWorstProfit.toFixed(2)}` +
        ` (exact split: $${a.stakes.exactProfit.toFixed(2)})`
    );
  }
}

const watch = num(arg("watch"));
runOnce()
  .catch((e) => console.error(e.message))
  .then(() => {
    if (watch) setInterval(() => runOnce().catch((e) => console.error(e.message)), watch * 1000);
  });
