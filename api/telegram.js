// POST /api/telegram — Telegram webhook endpoint.
// Set as webhook: https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<app>.vercel.app/api/telegram
// Optional: set WEBHOOK_SECRET env var and pass it as secret_token in setWebhook for verification.
const { loadState, saveState, availabilitySummary, formatSlot } = require('./_lib/store');
const { nextMonday, weekDates, fmtDay, parseIso } = require('./_lib/dates');
const { esc } = require('./_lib/markdown');
const tg = require('./_lib/telegram');

function displayName(u) { return u.first_name || u.username || String(u.id); }

function availKeyboard(state, mondayIso, userId) {
  const mine = (state.availability[mondayIso] && state.availability[mondayIso][String(userId)]) || [];
  const rows = weekDates(mondayIso).map((dayIso) => {
    const tick = mine.includes(dayIso) ? '✅ ' : '';
    return [{ text: tick + fmtDay(dayIso), callback_data: `avail:${mondayIso}:${dayIso}` }];
  });
  rows.push([{ text: 'Done — show week ✅', callback_data: `availdone:${mondayIso}` }]);
  return { inline_keyboard: rows };
}
function slotKeyboard(id) {
  return { inline_keyboard: [[
    { text: '✅ Join', callback_data: `slot:${id}:join` },
    { text: '❌ Leave', callback_data: `slot:${id}:leave` },
  ]] };
}
function askKeyboard(id) {
  return { inline_keyboard: [[
    { text: '✅ Yes', callback_data: `ask:${id}:yes` },
    { text: '🤔 Maybe', callback_data: `ask:${id}:maybe` },
    { text: '❌ No', callback_data: `ask:${id}:no` },
  ]] };
}
function askSummary(state, askId) {
  const ask = state.asks.find((a) => a.id === askId);
  if (!ask) return 'Ask not found.';
  const votes = state.askVotes[String(askId)] || {};
  const yes = [], maybe = [], no = [];
  for (const uid of Object.keys(votes)) {
    const v = votes[uid];
    if (v.vote === 'yes') yes.push(esc(v.name)); else if (v.vote === 'maybe') maybe.push(esc(v.name)); else no.push(esc(v.name));
  }
  return `❓ ${esc(ask.creator_name)} asks: ${esc(ask.question)}\n` +
    `✅ Yes (${yes.length}): ${yes.join(', ') || '—'}\n` +
    `🤔 Maybe (${maybe.length}): ${maybe.join(', ') || '—'}\n` +
    `❌ No (${no.length}): ${no.join(', ') || '—'}`;
}

async function handleMessage(msg) {
  const state = await loadState();
  const chat = msg.chat, user = msg.from;
  if (!user) return;
  state.players[String(user.id)] = { username: user.username || '', first_name: displayName(user), chat_id: chat.id };
  await saveState(state);

  const text = (msg.text || '').trim();
  if (!text) return;
  const parts = text.split(/\s+/);
  const cmd = parts[0].split('@')[0];
  const args = parts.slice(1);
  const chatId = chat.id;

  if (cmd === '/start') {
    await tg.sendMessage(chatId, '🎾 Hi! I\'m the Tennis Bot.\n\n• Sat 9am I ask for next week\'s availability\n• Sun 9am I nudge anyone who hasn\'t replied\n• /avail — tap days you\'re free next week\n• /week — see who\'s free when\n• /ask Anyone free Wed 7pm? — check before booking\n• /slot — create a booked court slot, others tap Join\n• /slots — see open slots\n• /help — all commands');
  } else if (cmd === '/help') {
    await tg.sendMessage(chatId, '🎾 Tennis Bot — commands\n\n/avail — mark days free next week (tap to toggle)\n/week — who\'s free next week\n/ask <question> — e.g. /ask Anyone free Tue 7pm at Kallang?\n/slot — create a slot (I\'ll ask date, time, venue)\n  or quick: /slot 2026-11-14 09:00 Kallang 4\n/slots — list open slots\n/cancel <id> — cancel a slot you created\n/players — who\'s registered');
  } else if (cmd === '/players') {
    const names = Object.keys(state.players).map((uid) => {
      const p = state.players[uid];
      return `• ${esc(p.first_name)}${p.username ? ` (@${esc(p.username)})` : ''}`;
    });
    await tg.sendMessage(chatId, names.length ? `🎾 Players:\n${names.join('\n')}` : 'No players yet — say /start to register.');
  } else if (cmd === '/avail') {
    const monday = nextMonday();
    await tg.sendMessage(chatId, `📅 ${esc(displayName(user))}, tap the days you're free next week (week of ${fmtDay(monday)}):`, availKeyboard(state, monday, user.id));
  } else if (cmd === '/week') {
    const monday = nextMonday();
    await tg.sendMessage(chatId, availabilitySummary(state, monday, fmtDay, weekDates));
  } else if (cmd === '/ask') {
    const q = args.join(' ');
    if (!q) { await tg.sendMessage(chatId, 'Usage: /ask Anyone free Wed 7pm at Kallang?'); return; }
    const id = state.nextAskId++;
    state.asks.push({ id, chat_id: chatId, creator_id: user.id, creator_name: displayName(user), question: q });
    await saveState(state);
    await tg.sendMessage(chatId, `❓ ${esc(displayName(user))} asks: ${esc(q)}\n\nTap to answer:`, askKeyboard(id));
  } else if (cmd === '/slots') {
    const open = state.slots.filter((s) => s.chat_id === chatId && (s.status === 'open' || s.status === 'full'));
    if (!open.length) { await tg.sendMessage(chatId, 'No open slots. Create one with /slot'); return; }
    for (const s of open) await tg.sendMessage(chatId, formatSlot(state, s, fmtDay), slotKeyboard(s.id));
  } else if (cmd === '/slot') {
    // Quick form: /slot 2026-11-14 09:00 Kallang 4 — wizard replies are handled via Telegram's
    // normal message flow in a future step; for v1, quick form + guided prompts in group.
    if (args.length >= 3 && /^\d{4}-\d{2}-\d{2}$/.test(args[0]) && /^\d{2}:\d{2}$/.test(args[1])) {
      let venue = args.slice(2).join(' '); let maxP = 4;
      const last = args[args.length - 1];
      if (/^\d+$/.test(last)) { maxP = parseInt(last, 10); venue = args.slice(2, -1).join(' ') || venue; }
      const slot = { id: state.nextSlotId++, chat_id: chatId, creator_id: user.id, creator_name: displayName(user), date: args[0], time: args[1], venue, max_players: maxP, status: 'open' };
      state.slots.push(slot);
      state.slotPlayers[String(slot.id)] = [{ user_id: user.id, name: displayName(user) }];
      await saveState(state);
      await tg.sendMessage(chatId, `🎾 Slot created!\n\n${formatSlot(state, slot, fmtDay)}`, slotKeyboard(slot.id));
    } else {
      await tg.sendMessage(chatId, '🎾 To create a slot, use:\n/slot 2026-11-14 09:00 Kallang 4\n\n(date, time, venue, max players)');
    }
  } else if (cmd === '/cancel') {
    const sid = parseInt(args[0], 10);
    if (!sid) { await tg.sendMessage(chatId, 'Usage: /cancel <slot id> — see /slots for IDs'); return; }
    let ok = false;
    state.slots.forEach((s) => { if (s.id === sid && s.creator_id === user.id) { s.status = 'cancelled'; ok = true; } });
    await saveState(state);
    await tg.sendMessage(chatId, ok ? 'Slot cancelled.' : 'Only the creator can cancel that slot.');
  }
}

async function handleCallback(cb) {
  const state = await loadState();
  const user = cb.from, msg = cb.message;
  if (!msg) return;
  state.players[String(user.id)] = { username: user.username || '', first_name: displayName(user), chat_id: msg.chat.id };
  const parts = (cb.data || '').split(':');
  const kind = parts[0];

  if (kind === 'avail') {
    const weekKey = parts[1], dayIso = parts[2];
    state.availability[weekKey] = state.availability[weekKey] || {};
    const mine = state.availability[weekKey][String(user.id)] || [];
    const idx = mine.indexOf(dayIso);
    if (idx !== -1) mine.splice(idx, 1); else mine.push(dayIso);
    state.availability[weekKey][String(user.id)] = mine;
    await saveState(state);
    await tg.answerCallbackQuery(cb.id, idx !== -1 ? `Removed ${dayIso}` : `Marked free ${dayIso}`);
    await tg.editMessageReplyMarkup(msg.chat.id, msg.message_id, availKeyboard(state, weekKey, user.id));
  } else if (kind === 'availdone') {
    const wk = parts[1];
    await tg.sendMessage(msg.chat.id, availabilitySummary(state, wk, fmtDay, weekDates));
    await tg.answerCallbackQuery(cb.id, 'Done');
  } else if (kind === 'slot') {
    const slotId = parseInt(parts[1], 10), action = parts[2];
    const slot = state.slots.find((s) => s.id === slotId);
    if (!slot) { await tg.answerCallbackQuery(cb.id, 'That slot no longer exists.', true); return; }
    let list = state.slotPlayers[String(slotId)] || [];
    if (action === 'join') {
      if (slot.status === 'cancelled') { await tg.answerCallbackQuery(cb.id, 'That slot is closed.', true); return; }
      if (slot.status === 'full') { await tg.answerCallbackQuery(cb.id, 'Sorry, that slot is full.', true); return; }
      if (list.some((p) => p.user_id === user.id)) { await tg.answerCallbackQuery(cb.id, "You're already in.", true); return; }
      list.push({ user_id: user.id, name: displayName(user) });
      state.slotPlayers[String(slotId)] = list;
      if (list.length >= slot.max_players) slot.status = 'full';
      await saveState(state);
      await tg.answerCallbackQuery(cb.id, "You're in! 🎾");
    } else {
      state.slotPlayers[String(slotId)] = list.filter((p) => p.user_id !== user.id);
      if (slot.status === 'full') slot.status = 'open';
      await saveState(state);
      await tg.answerCallbackQuery(cb.id, 'Left the slot.');
    }
    await tg.editMessageText(msg.chat.id, msg.message_id, formatSlot(state, slot, fmtDay), slotKeyboard(slotId));
    if (slot.status === 'full' && action === 'join') {
      await tg.sendMessage(msg.chat.id, `🎾 Slot on ${slot.date} ${slot.time} is now FULL — ${esc(slot.venue)}!`);
    }
  } else if (kind === 'ask') {
    const askId = parseInt(parts[1], 10), vote = parts[2];
    state.askVotes[String(askId)] = state.askVotes[String(askId)] || {};
    state.askVotes[String(askId)][String(user.id)] = { name: displayName(user), vote };
    await saveState(state);
    await tg.editMessageText(msg.chat.id, msg.message_id, askSummary(state, askId), askKeyboard(askId));
    await tg.answerCallbackQuery(cb.id, `Vote saved: ${vote}`);
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  // Optional webhook secret check
  const secret = process.env.WEBHOOK_SECRET;
  if (secret) {
    const got = req.headers['x-telegram-bot-api-secret-token'];
    if (got !== secret) return res.status(401).json({ ok: false, error: 'bad secret' });
  }
  try {
    const update = req.body;
    if (update.message) await handleMessage(update.message);
    else if (update.callback_query) await handleCallback(update.callback_query);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(200).json({ ok: false, error: String(e && e.message || e) });
  }
};
