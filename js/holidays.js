// ═══════════════════════════════════════════════════════════════
// holidays.js — SA public holiday calendar computation.
//   easterDate(year)        — Gregorian Easter algorithm
//   dateKey(d)              — "YYYY-MM-DD" from a Date
//   getSAPublicHolidays(y)  — Set of "YYYY-MM-DD" strings
//   buildPHCalendar(year)   — Map<"YYYY-MM-DD", dayName>
//
// Depends on: config.js (SA_FIXED_PH)
// ═══════════════════════════════════════════════════════════════

function easterDate(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getSAPublicHolidays(year) {
  const map = new Map(); // "YYYY-MM-DD" → name
  for (const ph of SA_FIXED_PH) {
    let d = new Date(year, ph.month, ph.day);
    if (d.getDay() === 0) d = new Date(year, ph.month, ph.day + 1); // Sunday → Monday
    map.set(dateKey(d), ph.name);
  }
  const easter = easterDate(year);
  const gf = new Date(easter); gf.setDate(easter.getDate() - 2);
  const fd = new Date(easter); fd.setDate(easter.getDate() + 1);
  map.set(dateKey(gf), 'Good Friday');
  map.set(dateKey(fd), 'Family Day');
  return map;
}

// === PARSER ===
// ── Roster PDF/Excel Parser ──
// Victoria Hospital EC shift roster → structured day/shift data.
//
// APPROACH:
//   1. Find column header time tokens per page → COLUMN ANCHORS (x-positions).
//   2. Each name token is assigned to the nearest anchor column.
//   3. Date line detection: DATE_RE for normal days; for split/PH days use
//      SA public holiday calendar to supply the missing weekday name.
//   4. Zone boundaries: midpoint-based with 25% buffer + closest-zone wins.
//
// PDF.js coordinates: x from left, y from BOTTOM (y increases upward).

const WEEKDAY_SHIFTS = [
  { label: '08:00–18:00', start: '08:00', end: '18:00' },
  { label: '12:00–22:00', start: '12:00', end: '22:00' },
  { label: '15:00–01:00', start: '15:00', end: '01:00' },
  { label: '22:00–10:00', start: '22:00', end: '10:00' },
];
const WEEKEND_SHIFTS = [
  { label: '08:00–20:00', start: '08:00', end: '20:00' },
  { label: '13:00–23:00', start: '13:00', end: '23:00' },
  { label: '20:00–10:00', start: '20:00', end: '10:00' },
];

const MONTHS_IDX = {
  january:0,february:1,march:2,april:3,may:4,june:5,
  july:6,august:7,september:8,october:9,november:10,december:11,
};
const MONTH_NAMES_LC = ['january','february','march','april','may','june',
  'july','august','september','october','november','december'];
const DAY_NAMES_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const DATE_RE = /^(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)(?:\s+(.+))?$/i;
const HAS_DATE = /\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i;
const PARTIAL_DATE_RE = /^(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+(?!Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)(.*))?$/i;

// ── SA Public Holiday calendar ──────────────────────────────────────────────
// Used to supply the weekday name when a PH date line has no weekday text.
const PARSER_SA_PH = [
  { month:0,  day:1,  name:"New Year's Day" },
  { month:2,  day:21, name:"Human Rights Day" },
  { month:3,  day:27, name:"Freedom Day" },
  { month:4,  day:1,  name:"Workers' Day" },
  { month:5,  day:16, name:"Youth Day" },
  { month:7,  day:9,  name:"National Women's Day" },
  { month:8,  day:24, name:"Heritage Day" },
  { month:11, day:16, name:"Day of Reconciliation" },
  { month:11, day:25, name:"Christmas Day" },
  { month:11, day:26, name:"Day of Goodwill" },
];

function parserEasterDate(year) {
  const a=year%19, b=Math.floor(year/100), c=year%100;
  const d=Math.floor(b/4), e=b%4, f=Math.floor((b+8)/25);
  const g=Math.floor((b-f+1)/3), h=(19*a+b-d-g+15)%30;
  const i=Math.floor(c/4), k=c%4, l=(32+2*e+2*i-h-k)%7;
  const m=Math.floor((a+11*h+22*l)/451);
  const month=Math.floor((h+l-7*m+114)/31)-1;
  const day=((h+l-7*m+114)%31)+1;
  return new Date(year, month, day);
}

// Returns Map<"YYYY-MM-DD", dayName> for all SA public holidays in a year.
function buildPHCalendar(year) {
  const map = new Map();
  const key = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  for (const ph of PARSER_SA_PH) {
    let d = new Date(year, ph.month, ph.day);
    if (d.getDay() === 0) d = new Date(year, ph.month, ph.day+1); // Sunday → Monday
    map.set(key(d), DAY_NAMES_FULL[d.getDay()]);
  }
  const easter = parserEasterDate(year);
  const gf = new Date(easter); gf.setDate(easter.getDate()-2);
  const fd = new Date(easter); fd.setDate(easter.getDate()+1);
  map.set(key(gf), DAY_NAMES_FULL[gf.getDay()]);
  map.set(key(fd), DAY_NAMES_FULL[fd.getDay()]);
  return map;
}

