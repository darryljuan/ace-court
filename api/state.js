// GET /api/state — public read-only state for the dashboard (public/index.html).
// No secrets, no bot token. Returns next-week availability + open slots + players + leaderboard.
const { loadState, availabilitySummary, formatSlot } = require('./_lib/store');
const { nextMonday, weekDates, fmtDay } = require('./_lib/dates');
const { seasonFor, computeLeaderboard } = require('./_lib/scoring');

module.exports = async (req, res) => {
  const state = await loadState();
  const season = seasonFor();
  const monday = nextMonday();
  const openSlots = state.slots
    .filter((s) => s.status === 'open' || s.status === 'full')
    .map((s) => ({ ...s, text: formatSlot(state, s, fmtDay), players: state.slotPlayers[String(s.id)] || [] }));
  res.status(200).json({
    ok: true,
    season: season.label,
    seasonKey: season.key,
    leaderboard: computeLeaderboard(state, season.key),
    results: (state.results || []).filter((r) => r.season === season.key),
    weekMonday: monday,
    availability: availabilitySummary(state, monday, fmtDay, weekDates),
    availabilityByDay: Object.fromEntries(
      weekDates(monday).map((d) => {
        const week = state.availability[monday] || {};
        const names = Object.keys(week).filter((uid) => week[uid].includes(d)).map((uid) => state.players[uid]?.first_name).filter(Boolean);
        return [d, names];
      })
    ),
    players: Object.values(state.players),
    slots: openSlots,
    updatedAt: new Date().toISOString(),
  });
};
