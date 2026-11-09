// ACe Court scoring — confirmed by Darryl 2026-11-09:
//   Singles + doubles. Both players on a winning doubles pair get the same points.
//   Win = 3 points, loss = 1 point. Season = a quarter, then reset.
const WIN_POINTS = 3;
const LOSS_POINTS = 1;

function seasonFor(date = new Date()) {
  // Use SGT calendar for the season boundary
  const parts = new Intl.DateTimeFormat('en-SG', {
    timeZone: 'Asia/Singapore', year: 'numeric', month: 'numeric',
  }).formatToParts(date);
  const y = Number(parts.find((p) => p.type === 'year').value);
  const m = Number(parts.find((p) => p.type === 'month').value);
  const q = Math.floor((m - 1) / 3) + 1;
  return { key: `${y}-Q${q}`, label: `Q${q} ${y}`, year: y, quarter: q };
}

function computeLeaderboard(state, seasonKey) {
  const board = {};
  // Start every registered player at 0-0-0 so the board always shows the crew
  for (const uid of Object.keys(state.players || {})) {
    const p = state.players[uid];
    board[p.first_name] = { name: p.first_name, won: 0, lost: 0, points: 0 };
  }
  for (const r of state.results || []) {
    if (seasonKey && r.season !== seasonKey) continue;
    for (const name of r.winners || []) {
      if (!board[name]) board[name] = { name, won: 0, lost: 0, points: 0 };
      board[name].won += 1;
      board[name].points += WIN_POINTS;
    }
    for (const name of r.losers || []) {
      if (!board[name]) board[name] = { name, won: 0, lost: 0, points: 0 };
      board[name].lost += 1;
      board[name].points += LOSS_POINTS;
    }
  }
  return Object.values(board).sort(
    (a, b) => b.points - a.points || b.won - a.won || a.name.localeCompare(b.name)
  );
}

module.exports = { WIN_POINTS, LOSS_POINTS, seasonFor, computeLeaderboard };
