// POST /api/result — log a match result.
// Body: { type: "singles" | "doubles", winners: ["Darryl"], losers: ["David"], score: "6-4, 6-3" }
// Singles: 1 winner + 1 loser. Doubles: 2 winners + 2 losers, both winners get the same points.
// Scoring: win 3, loss 1. Season = current quarter (SGT).
const { loadState, saveState } = require('./_lib/store');
const { seasonFor, computeLeaderboard } = require('./_lib/scoring');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  const { type, winners, losers, score } = req.body || {};
  if (!Array.isArray(winners) || !Array.isArray(losers) || !winners.length || !losers.length) {
    return res.status(400).json({ ok: false, error: 'winners and losers arrays required' });
  }
  if (type === 'singles' && (winners.length !== 1 || losers.length !== 1)) {
    return res.status(400).json({ ok: false, error: 'singles needs 1 winner and 1 loser' });
  }
  if (type === 'doubles' && (winners.length !== 2 || losers.length !== 2)) {
    return res.status(400).json({ ok: false, error: 'doubles needs 2 winners and 2 losers' });
  }
  const state = await loadState();
  const season = seasonFor();
  state.results = state.results || [];
  state.results.push({
    id: state.results.length + 1,
    season: season.key,
    type: type || 'singles',
    winners, losers,
    score: score || '',
    date: new Date().toISOString().slice(0, 10),
  });
  await saveState(state);
  return res.status(200).json({
    ok: true,
    season: season.label,
    leaderboard: computeLeaderboard(state, season.key),
  });
};
