// Minimal backend for the picks app.
// Run: npm install express cors dotenv && node server.js
//
// Right now this serves mock data. To go live, replace fetchFromProvider()
// with a real call to your data source (see notes at bottom of file) and
// keep computeGradeAndEdge() as your own scoring logic — don't expose your
// provider's raw response or API key to the client.

const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { scan: scanArbs } = require("./arb/scanner");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

// ---------------------------------------------------------------------------
// Mock "database" of recent game logs, standing in for a real stats provider.
// Shape: last N games' result (1 = hit the threshold, 0 = didn't).
// ---------------------------------------------------------------------------
const MOCK_LOGS = {
  "O. Peraza": { team: "NYY", opp: "TEX", prop: "Hits+Runs+RBIs", threshold: 1.5, dir: "under", last20: [1,1,0,1,1,1,0,1,1,1,1,0,1,1,1,1,0,1,1,1] },
  "A. Monasterio": { team: "MIL", opp: "TOR", prop: "Hits+Runs+RBIs", threshold: 1.5, dir: "over", last20: [0,1,1,0,0,1,0,1,1,0,1,0,0,1,1,0,1,0,1,0] },
  "C. Whisenhunt": { team: "SEA", opp: "HOU", prop: "Walks", threshold: 1.5, dir: "over", last20: [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1] },
  "R. Johnson": { team: "TB", opp: "TEX", prop: "Pitcher Outs", threshold: 15.5, dir: "under", last20: [1,1,1,0,1,1,1,1,0,1,1,1,1,1,1,1,1,1,0,1] },
  "F. Freeman": { team: "LAD", opp: "KC", prop: "Singles", threshold: 0.5, dir: "over", last20: [1,1,0,1,1,0,1,1,1,0,1,1,0,1,1,1,0,1,1,1] },
  "S. Ohtani": { team: "LAD", opp: "KC", prop: "Batter Walks", threshold: 0.5, dir: "under", last20: [1,1,1,0,1,1,0,1,1,1,1,1,0,1,1,1,1,0,1,1] },
};

function pctHit(arr) {
  if (!arr || arr.length === 0) return null;
  return Math.round((arr.filter((x) => x === 1).length / arr.length) * 100);
}

function gradeFromPct(pct) {
  if (pct == null) return "N/A";
  if (pct >= 85) return "A";
  if (pct >= 70) return "B";
  if (pct >= 55) return "C";
  if (pct >= 40) return "D";
  return "F";
}

// This is YOUR scoring logic — the thing that makes your app's picks
// different from just re-showing a provider's raw numbers.
function computeGradeAndEdge(log) {
  const l5 = pctHit(log.last20.slice(-5));
  const l10 = pctHit(log.last20.slice(-10));
  const l20 = pctHit(log.last20);
  const blended = Math.round(l5 * 0.5 + l10 * 0.3 + l20 * 0.2);
  const impliedBookProb = 50; // placeholder: pull from real odds via provider
  const edge = Math.max(0, blended - impliedBookProb);
  return { grade: gradeFromPct(blended), edge, windows: { L5: l5, L10: l10, L20: l20 } };
}

// Real MLB Stats API integration — public, no API key required.
// Docs (unofficial but stable/widely used): statsapi.mlb.com
//
// Two calls: (1) today's schedule, to know who's playing today,
// (2) each team's recent game log, to compute real hit-rate windows.
// This replaces MOCK_LOGS with genuine data — set USE_LIVE_DATA=true
// in your .env once you've tested it.
const USE_LIVE_DATA = process.env.USE_LIVE_DATA === "true";
const MLB_BASE = "https://statsapi.mlb.com/api/v1";

async function fetchTodaysGames() {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const res = await fetch(`${MLB_BASE}/schedule?sportId=1&date=${today}`);
  const data = await res.json();
  const games = data.dates?.[0]?.games || [];
  return games.map((g) => ({
    gamePk: g.gamePk,
    home: g.teams.home.team.name,
    away: g.teams.away.team.name,
    homeId: g.teams.home.team.id,
    awayId: g.teams.away.team.id,
    status: g.status.detailedState,
  }));
}

// Pull a team's active roster, then each player's last-20-game log for a
// given stat. This is intentionally simple — a real product would cache
// this aggressively (rosters/logs don't need refetching every request)
// and pick specific stat categories per prop type rather than one blanket stat.
async function fetchTeamRecentHitters(teamId, statKey = "hits") {
  const rosterRes = await fetch(`${MLB_BASE}/teams/${teamId}/roster/active`);
  const roster = await rosterRes.json();
  const hitters = (roster.roster || []).filter((p) => p.position.type !== "Pitcher").slice(0, 5);

  const logs = {};
  for (const p of hitters) {
    const logRes = await fetch(
      `${MLB_BASE}/people/${p.person.id}/stats?stats=gameLog&group=hitting&season=2026`
    );
    const logData = await logRes.json();
    const games = logData.stats?.[0]?.splits || [];
    const last20 = games.slice(-20).map((g) => (Number(g.stat[statKey]) > 0 ? 1 : 0));
    if (last20.length > 0) {
      logs[p.person.fullName] = { last20, team: p.person.fullName };
    }
  }
  return logs;
}

async function fetchFromProvider() {
  if (!USE_LIVE_DATA) return MOCK_LOGS;

  try {
    const games = await fetchTodaysGames();
    if (games.length === 0) return MOCK_LOGS;

    // Just the first game today, to keep this example fast — expand once tested.
    const g = games[0];
    const homeHitters = await fetchTeamRecentHitters(g.homeId);

    const logs = {};
    for (const [name, data] of Object.entries(homeHitters)) {
      logs[name] = {
        team: g.home,
        opp: g.away,
        prop: "Hits",
        threshold: 0.5,
        dir: "over",
        last20: data.last20,
      };
    }
    return Object.keys(logs).length > 0 ? logs : MOCK_LOGS;
  } catch (err) {
    console.error("Live data fetch failed, falling back to mock:", err.message);
    return MOCK_LOGS;
  }
}

app.get("/api/picks", async (req, res) => {
  try {
    const logs = await fetchFromProvider();
    const picks = Object.entries(logs).map(([player, log], i) => {
      const { grade, edge, windows } = computeGradeAndEdge(log);
      return {
        id: i + 1,
        player,
        team: log.team,
        opp: log.opp,
        prop: log.prop,
        threshold: log.threshold,
        dir: log.dir,
        grade,
        edge,
        windows,
      };
    });
    picks.sort((a, b) => b.edge - a.edge);
    res.json({ picks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load picks" });
  }
});

// Pre-market arbitrage scanner across NJ sportsbooks. All query params optional:
//   sports=basketball_nba,icehockey_nhl  markets=h2h,totals  books=draftkings,fanduel
//   minProfit=0.5 (percent)  bankroll=500  roundTo=5
app.get("/api/arbs", async (req, res) => {
  const list = (v) => (v ? String(v).split(",").map((s) => s.trim()).filter(Boolean) : undefined);
  const num = (v) => (v === undefined || v === "" || isNaN(Number(v)) ? undefined : Number(v));
  try {
    const result = await scanArbs({
      sports: list(req.query.sports),
      markets: list(req.query.markets),
      books: list(req.query.books),
      minProfitPct: num(req.query.minProfit),
      maxProfitPct: num(req.query.maxProfit),
      bankroll: num(req.query.bankroll),
      roundTo: num(req.query.roundTo),
    });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Arb scan failed", detail: err.message });
  }
});

// Called by the app after a successful RevenueCat/StoreKit purchase to
// confirm entitlement server-side (RevenueCat can also webhook this to you).
app.post("/api/verify-subscription", (req, res) => {
  const { userId, entitlement } = req.body;
  // TODO: look up entitlement via RevenueCat REST API or your own DB
  res.json({ userId, active: !!entitlement });
});

app.listen(PORT, () => {
  console.log(`Picks API running on http://localhost:${PORT}`);
});

// ---------------------------------------------------------------------------
// Going live — three things to swap in, each needs your own account:
// 1. fetchFromProvider(): call a real stats API (needs an API key + a paid
//    plan on most providers for prop-level data).
// 2. Deploy this file somewhere (Render, Railway, Fly.io, or a VPS) so the
//    app can reach it from a phone, not just localhost.
// 3. /api/verify-subscription: wire to RevenueCat's REST API using your
//    RevenueCat secret key, so entitlement checks don't rely on the client
//    alone (a modified client could otherwise fake "subscribed").
// ---------------------------------------------------------------------------
