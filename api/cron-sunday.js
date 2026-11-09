// POST /api/cron-sunday — called by GitHub Actions, Sun 01:00 UTC = 09:00 SGT.
// Auth: header `Authorization: Bearer <CRON_SECRET>` or `?secret=<CRON_SECRET>`
// Reminds only players who haven't marked availability for next week.
const { loadState, missingPlayers } = require('./_lib/store');
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
  const missing = missingPlayers(state, monday);
  if (!missing.length) {
    await tg.sendMessage(Number(groupId), '🎾 Everyone has put their availability for next week — nice!');
    return res.status(200).json({ ok: true, week: monday, missing: 0 });
  }
  const tags = missing.map((p) => tg.mention(p.user_id, p.first_name)).join(' ');
  await tg.sendMessage(Number(groupId),
    `⏰ Sunday reminder — still waiting on availability for next week:\n${tags}\n\nTap /avail to mark your days.`);
  return res.status(200).json({ ok: true, week: monday, missing: missing.length });
};
