// Minimal Telegram Bot API client via fetch. No dependencies.
const API = 'https://api.telegram.org';

function token() { return process.env.TELEGRAM_BOT_TOKEN; }

async function api(method, payload) {
  if (!token()) throw new Error('TELEGRAM_BOT_TOKEN not set');
  const res = await fetch(`${API}/bot${token()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.ok) throw new Error(`Telegram ${method} failed: ${JSON.stringify(json)}`);
  return json.result;
}

function sendMessage(chatId, text, replyMarkup) {
  const p = { chat_id: chatId, text, parse_mode: 'Markdown', disable_web_page_preview: true };
  if (replyMarkup) p.reply_markup = replyMarkup;
  return api('sendMessage', p);
}
function editMessageText(chatId, messageId, text, replyMarkup) {
  const p = { chat_id: chatId, message_id: messageId, text, parse_mode: 'Markdown' };
  if (replyMarkup) p.reply_markup = replyMarkup;
  return api('editMessageText', p);
}
function editMessageReplyMarkup(chatId, messageId, replyMarkup) {
  return api('editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: replyMarkup });
}
function answerCallbackQuery(id, text, showAlert) {
  return api('answerCallbackQuery', { callback_query_id: id, text: text || '', show_alert: !!showAlert });
}
function mention(userId, name) { return `[${name}](tg://user?id=${userId})`; }

module.exports = { api, sendMessage, editMessageText, editMessageReplyMarkup, answerCallbackQuery, mention };
