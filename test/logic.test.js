// npm test — no token, no network. Tests dates, availability, slots, cron auth logic.
const assert = require('assert');
const { nextMonday, weekDates, fmtDay } = require('../api/_lib/dates');
const { emptyState, availabilitySummary, missingPlayers, formatSlot } = require('../api/_lib/store');

// Dates: next Monday is always +7 from a Monday, and the following Monday after Sat/Sun
// Use a fixed SGT noon instant: 2026-11-09 12:00 SGT = 2026-11-09 04:00 UTC (Mon)
assert.strictEqual(nextMonday(new Date('2026-11-09T04:00:00Z')), '2026-11-16', 'Mon 9 Nov -> Mon 16 Nov');
assert.strictEqual(nextMonday(new Date('2026-11-14T04:00:00Z')), '2026-11-16', 'Sat 14 Nov -> Mon 16 Nov');
assert.strictEqual(nextMonday(new Date('2026-11-15T04:00:00Z')), '2026-11-16', 'Sun 15 Nov -> Mon 16 Nov');
assert.strictEqual(weekDates('2026-11-16').length, 7, 'week has 7 days');
assert.strictEqual(weekDates('2026-11-16')[0], '2026-11-16', 'week starts Mon');
assert.strictEqual(fmtDay('2026-11-16'), 'Mon 16 Nov', 'fmtDay Mon 16 Nov');
console.log('✓ dates (SGT, Sat 9am = 01:00 UTC)');

// Availability
const s = emptyState();
for (const [id, name] of [[1, 'Darryl'], [2, 'David'], [3, 'Andre'], [4, 'Keith']]) {
  s.players[String(id)] = { username: name.toLowerCase(), first_name: name, chat_id: -100 };
}
s.availability['2026-11-16'] = { 1: ['2026-11-16', '2026-11-17'], 2: ['2026-11-16'] };
assert.deepStrictEqual(missingPlayers(s, '2026-11-16').map((p) => p.first_name), ['Andre', 'Keith']);
const summary = availabilitySummary(s, '2026-11-16', fmtDay, weekDates);
assert.ok(summary.includes('Darryl, David') && summary.includes('Mon 16 Nov'));
console.log('✓ availability + Sunday missing-player check');
console.log(summary);

// Slots
const slot = { id: 1, chat_id: -100, creator_id: 1, creator_name: 'Darryl', date: '2026-11-14', time: '09:00', venue: 'Kallang', max_players: 4, status: 'open' };
s.slots.push(slot);
s.slotPlayers['1'] = [{ user_id: 1, name: 'Darryl' }, { user_id: 2, name: 'David' }, { user_id: 3, name: 'Andre' }, { user_id: 4, name: 'Keith' }];
slot.status = 'full';
assert.ok(formatSlot(s, slot, fmtDay).includes('✅ FULL') && formatSlot(s, slot, fmtDay).includes('4/4'));
console.log('✓ slots format (full 4/4)');
console.log(formatSlot(s, slot, fmtDay));

// Cron auth logic (mirrors api/cron-*.js authorised())
function authorised(headers, query, secret) {
  if (!secret) return false;
  if ((headers.authorization || '') === `Bearer ${secret}`) return true;
  return (query.secret || '') === secret;
}
assert.strictEqual(authorised({ authorization: 'Bearer abc123' }, {}, 'abc123'), true);
assert.strictEqual(authorised({}, { secret: 'abc123' }, 'abc123'), true);
assert.strictEqual(authorised({ authorization: 'Bearer wrong' }, {}, 'abc123'), false);
assert.strictEqual(authorised({}, {}, 'abc123'), false);
console.log('✓ cron auth (Bearer + ?secret=, rejects wrong/missing)');

// GitHub Actions cron expressions: Sat 01:00 UTC = 09:00 SGT, Sun 01:00 UTC = 09:00 SGT
const fs = require('fs');
const yml = fs.readFileSync(__dirname + '/../.github/workflows/pings.yml', 'utf8');
assert.ok(yml.includes("cron: '0 1 * * 6'"), 'pings.yml has Sat 01:00 UTC');
assert.ok(yml.includes("cron: '0 1 * * 0'"), 'pings.yml has Sun 01:00 UTC');
assert.ok(yml.includes('/api/cron-saturday') && yml.includes('/api/cron-sunday'), 'pings.yml calls back to Vercel app');
console.log('✓ GitHub Actions workflow (Sat/Sun 01:00 UTC → Vercel cron endpoints)');

// Scoring: win 3, loss 1, singles + doubles, season = quarter
const { seasonFor, computeLeaderboard, WIN_POINTS, LOSS_POINTS } = require('../api/_lib/scoring');
assert.strictEqual(WIN_POINTS, 3, 'win = 3 points');
assert.strictEqual(LOSS_POINTS, 1, 'loss = 1 point');
assert.strictEqual(seasonFor(new Date('2026-11-09T04:00:00Z')).key, '2026-Q4', 'Nov 2026 is Q4 2026');
assert.strictEqual(seasonFor(new Date('2027-01-15T04:00:00Z')).key, '2027-Q1', 'Jan 2027 is Q1 2027 (season resets)');
const s2 = emptyState();
for (const [id, name] of [[1, 'Darryl'], [2, 'David'], [3, 'Andre'], [4, 'Keith']]) {
  s2.players[String(id)] = { username: name.toLowerCase(), first_name: name, chat_id: -100 };
}
s2.results = [
  { season: '2026-Q4', type: 'singles', winners: ['Darryl'], losers: ['David'], score: '6-4, 6-3' },
  { season: '2026-Q4', type: 'doubles', winners: ['Darryl', 'Keith'], losers: ['David', 'Andre'], score: '6-4, 6-3' },
  { season: '2026-Q3', type: 'singles', winners: ['Andre'], losers: ['Keith'], score: '6-0, 6-0' }, // old season, ignored
];
const board = computeLeaderboard(s2, '2026-Q4');
assert.deepStrictEqual(board.map((r) => [r.name, r.won, r.lost, r.points]), [
  ['Darryl', 2, 0, 6],
  ['Keith', 1, 0, 3],
  ['David', 0, 2, 2],
  ['Andre', 0, 1, 1],
], 'doubles winners both get 3, losers get 1, Q3 ignored — got ' + JSON.stringify(board));
console.log('✓ scoring (singles + doubles, win 3 / loss 1, quarter season)');

// Markdown escaping: usernames/names with '_' broke Telegram replies.
// /players failed 2026-11-09 with "can't parse entities" on @darryl_juan,
// because every message is sent with parse_mode 'Markdown' and the '_' opened
// an italic entity that never closed. Names must be escaped in message text.
const { esc } = require('../api/_lib/markdown');
const { mention } = require('../api/_lib/telegram');
assert.strictEqual(esc('darryl_juan'), 'darryl\\_juan', 'underscore escaped');
assert.strictEqual(esc('Darryl'), 'Darryl', 'plain names unchanged');
assert.strictEqual(esc('a*b[c]'), 'a\\*b\\[c\\]', 'other Markdown chars escaped');
assert.strictEqual(mention(528219308, 'Darryl_Juan'), '[Darryl\\_Juan](tg://user?id=528219308)', 'mention link text escaped');
const s3 = emptyState();
s3.players['528219308'] = { username: 'darryl_juan', first_name: 'Darryl_Juan', chat_id: -100 };
s3.availability['2026-11-16'] = { '528219308': ['2026-11-16'] };
assert.ok(availabilitySummary(s3, '2026-11-16', fmtDay, weekDates).includes('Darryl\\_Juan'), 'availability names escaped');
const slot2 = { id: 2, chat_id: -100, creator_id: 528219308, creator_name: 'Darryl_Juan', date: '2026-11-14', time: '09:00', venue: 'Kallang_Court', max_players: 4, status: 'open' };
s3.slotPlayers['2'] = [{ user_id: 528219308, name: 'Darryl_Juan' }];
assert.ok(formatSlot(s3, slot2, fmtDay).includes('Darryl\\_Juan') && formatSlot(s3, slot2, fmtDay).includes('Kallang\\_Court'), 'slot names + venue escaped');
console.log('✓ Markdown escaping (underscore usernames no longer break replies)');

console.log('\nAll Vercel logic tests passed.');
