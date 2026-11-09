// POST /api/cron-saturday — called by GitHub Actions, Sat 01:00 UTC = 09:00 SGT.
// Auth: header `Authorization: Bearer <CRON_SECRET>` or `?secret=<CRON_SECRET>`
// Sends the Saturday ping to the Telegram group, tags all registered players.
const { loadState } = require('./_lib/store');
const { nextMonday, fmtDay } = require('./_lib/dates');
const tg = require('./_lib/telegram');

function authorised(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const h = req.headers.authorization || '';
  if (h === `Bearer ${secret}`) return true;
  const q = (req.query && req.query.secret) || '';
  return q === secret;
}

module.exports = async (req, res) => {
  if (!authorised(req)) return res.status(401).json({ ok: false, error: 'unauthorised' });
  const groupId = process.env.GROUP_CHAT_ID;
  if (!groupId) return res.status(500).json({ ok: false, error: 'GROUP_CHAT_ID not set' });
  const state = await loadState();
  const monday = nextMonday();
  const tags = Object.keys(state.players)
    .map((uid) => tg.mention(uid, state.players[uid].first_name))
    .join(' ');
  await tg.sendMessage(Number(groupId),
    `🎾 Saturday check-in!\n${tags}\n\nTap /avail and mark the days you're free next week (week of ${fmtDay(monday)}).`);
  return res.status(200).json({ ok: true, week: monday, tagged: Object.keys(state.players).length });
};
