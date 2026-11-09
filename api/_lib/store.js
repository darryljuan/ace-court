// Persistent state for the tennis bot.
// Production: Upstash Redis via REST (free tier) — set in Vercel env vars:
//   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
//   (create in Vercel Dashboard > Storage > Create > KV, or Upstash console)
// Local dev / no env vars: in-memory fallback (data lost on restart — for testing only).
// State shape: { players:{}, availability:{}, slots:[], slotPlayers:{}, asks:[], askVotes:{}, nextSlotId, nextAskId }

const KEY = 'tennis:state:v1';
const { esc } = require('./markdown');

function emptyState() {
  return { players: {}, availability: {}, slots: [], slotPlayers: {}, asks: [], askVotes: {}, results: [], nextSlotId: 1, nextAskId: 1 };
}

let memoryState = null;

async function redisGet() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const res = await fetch(`${url}/get/${encodeURIComponent(KEY)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const json = await res.json();
  if (!json.result) return null;
  try { return JSON.parse(json.result); } catch { return null; }
}

async function redisSet(state) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return false;
  const res = await fetch(`${url}/set/${encodeURIComponent(KEY)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: JSON.stringify(state) }),
  });
  return res.ok;
}

async function loadState() {
  const fromRedis = await redisGet();
  if (fromRedis && fromRedis.players) return fromRedis;
  if (!memoryState) memoryState = emptyState();
  return memoryState;
}

async function saveState(state) {
  memoryState = state;
  await redisSet(state);
  return state;
}

// --- pure helpers on a state object (used by handlers + tests) ---
function availabilitySummary(state, weekMondayIso, fmtDay, weekDates) {
  const lines = [`📅 Availability — week of ${fmtDay(weekMondayIso)}`];
  for (const dayIso of weekDates(weekMondayIso)) {
    const names = [];
    const week = state.availability[weekMondayIso] || {};
    for (const uid of Object.keys(week)) {
      if (week[uid].includes(dayIso) && state.players[uid]) names.push(esc(state.players[uid].first_name));
    }
    lines.push(`${fmtDay(dayIso)}: ${names.length ? names.join(', ') : '—'}`);
  }
  return lines.join('\n');
}

function missingPlayers(state, weekMondayIso) {
  const week = state.availability[weekMondayIso] || {};
  return Object.keys(state.players).filter(
    (uid) => !(week[uid] && week[uid].length)
  ).map((uid) => ({ user_id: Number(uid), ...state.players[uid] }));
}

function formatSlot(state, slot, fmtDay) {
  const players = state.slotPlayers[String(slot.id)] || [];
  const names = players.map((p) => esc(p.name)).join(', ');
  const status = slot.status === 'full' ? '✅ FULL' : '🟢 Open';
  return `🎾 ${fmtDay(slot.date)} ${slot.time} — ${esc(slot.venue)}\n` +
    `Booked by ${esc(slot.creator_name)} • ${players.length}/${slot.max_players} • ${status}\n` +
    `Players: ${names || '—'}\nID: ${slot.id}`;
}

module.exports = { emptyState, loadState, saveState, availabilitySummary, missingPlayers, formatSlot };
