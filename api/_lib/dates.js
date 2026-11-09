// Singapore-time date helpers. Pure functions, tested in test/logic.test.js
// All week keys are YYYY-MM-DD (Monday), days are YYYY-MM-DD.

function pad(n) { return String(n).padStart(2, '0'); }

function partsInSGT(date) {
  // Use Intl to get SGT calendar parts for an instant
  const fmt = new Intl.DateTimeFormat('en-SG', {
    timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const p = {};
  for (const part of fmt.formatToParts(date)) p[part.type] = part.value;
  return p; // {year, month, day, weekday:'Mon', hour, minute}
}

function todaySGT(now = new Date()) {
  const p = partsInSGT(now);
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), weekday: p.weekday };
}

function isoFromYMD(y, m, d) { return `${y}-${pad(m)}-${pad(d)}`; }

function parseIso(s) {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d, date: new Date(Date.UTC(y, m - 1, d)) };
}

// Weekday (Mon=1..Sun=7) for a YMD, computed in UTC to avoid TZ shifts
function weekdayNum(y, m, d) {
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 Sun..6 Sat
  return wd === 0 ? 7 : wd;
}

function addDaysYMD(y, m, d, n) {
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function nextMonday(now = new Date()) {
  const t = todaySGT(now);
  const wd = weekdayNum(t.y, t.m, t.d); // 1 Mon..7 Sun
  const add = wd === 1 ? 7 : 8 - wd;
  const n = addDaysYMD(t.y, t.m, t.d, add);
  return isoFromYMD(n.y, n.m, n.d);
}

function weekDates(mondayIso) {
  const p = parseIso(mondayIso);
  const out = [];
  for (let i = 0; i < 7; i++) {
    const n = addDaysYMD(p.y, p.m, p.d, i);
    out.push(isoFromYMD(n.y, n.m, n.d));
  }
  return out;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDay(iso) {
  const p = parseIso(iso);
  const wd = DAY_NAMES[weekdayNum(p.y, p.m, p.d) - 1];
  return `${wd} ${p.d} ${MONTHS[p.m - 1]}`;
}

module.exports = { nextMonday, weekDates, fmtDay, parseIso, todaySGT, isoFromYMD };
