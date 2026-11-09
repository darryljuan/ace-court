// Escape user-controlled text for Telegram's legacy Markdown parse mode.
// The bot sends every message with parse_mode 'Markdown', so an unescaped
// '_' '*' '`' or '[' in a name or typed text (e.g. username @darryl_juan)
// opens an entity that never closes and Telegram rejects the whole message
// with "can't parse entities". Escape those chars wherever a name, username,
// venue or typed question is interpolated into message text. The mention link
// itself is built by telegram.js, which escapes the link text with this too.
function esc(s) {
  return String(s == null ? '' : s).replace(/([\\*_`\[\]])/g, '\\$1');
}

module.exports = { esc };
