/**
 * __NAME__ RSVP — Google Apps Script backend.
 * The site lives on GitHub Pages and calls doPost() below as a JSON API.
 * (The old <web app URL> page via doGet still works as a fallback.)
 * Every RSVP lands as a row in the "RSVPs" tab of the sheet below.
 */

const SPREADSHEET_ID = '__SHEET_ID__'; // the "__NAME__ RSVPs" sheet
const SHEET_NAME = 'RSVPs';
const ADMINS = __ADMINS__;
// Invited families: the RSVP dropdown shows exactly these.
const FAMILIES = __GUESTS__;
const DEFAULT_EVENT = __EVENT__;
const HEADERS = [
  'id', 'email (hosts only)', 'updated', 'household', 'status', 'adults', 'kids', 'kid_ages',
  'contact (hosts only)', 'dietary needs (hosts only)', 'dishes', 'extras', 'message', 'dishes_json'
];
const CATEGORIES = ['mains', 'salads', 'sides', 'starters', 'desserts', 'soft', 'alcohol'];
const TAGS = ['veg', 'vegan', 'gf', 'df', 'nuts'];
const STATUSES = ['yes', 'maybe', 'no'];
const SESSION_DAYS = 30;

function doGet() {
  return ContentService.createTextOutput('__NAME__ RSVP API');
}

// ---------------- JSON API (used by the GitHub Pages site) ----------------
// The page POSTs {fn, args} as text/plain (no CORS preflight); we answer with JSON.
// Calls arrive anonymously, so Google's "signed in to several accounts" problem can't happen.
const API = {
  boot: boot, findByEmail: findByEmail, save: save,
  adminCheck: adminCheck, adminSendCode: adminSendCode, adminVerify: adminVerify, adminSignOut: adminSignOut,
  adminGetAll: adminGetAll, adminSaveEvent: adminSaveEvent, adminDelete: adminDelete, adminClearAll: adminClearAll
};
function doPost(e) {
  let out;
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const fn = API.hasOwnProperty(req.fn) ? API[req.fn] : null;
    if (!fn) throw new Error('Unknown request.');
    out = { ok: true, result: fn.apply(null, Array.isArray(req.args) ? req.args : []) };
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/** Run once from the editor to create the RSVPs tab and grant permissions. */
function setup() {
  sheet_();
  MailApp.getRemainingDailyQuota(); // makes sure the email permission is granted up front
}

function sheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  // Lay out (or upgrade) the header row while the sheet has no RSVPs in it.
  if (sh.getLastRow() < 2 && sh.getRange(1, 2).getValue() !== HEADERS[1]) {
    sh.clear();
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.showColumns(1, HEADERS.length);
    sh.hideColumns(14); // raw dish data
  }
  return sh;
}

function rows_() {
  const sh = sheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, HEADERS.length).getValues()
    .map((r, i) => ({ row: i + 2, r }))
    .filter(x => x.r[0]);
}

function parseDishes_(v) {
  try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; }
  catch (e) { return []; }
}

/** What every guest can see — no email, phone or dietary notes. */
function publicRec_(r) {
  return {
    id: String(r[0]),
    updated: r[2] instanceof Date ? r[2].toISOString() : String(r[2]),
    household: String(r[3]),
    status: String(r[4]),
    adults: Number(r[5]) || 0,
    kids: Number(r[6]) || 0,
    kidAges: String(r[7]),
    dishes: parseDishes_(r[13]),
    extras: String(r[11]),
    message: String(r[12])
  };
}
function privateRec_(r) {
  const p = publicRec_(r);
  p.email = String(r[1]);
  p.contact = String(r[8]);
  p.dietary = String(r[9]);
  return p;
}

function normEmail_(v) {
  return String(v == null ? '' : v).trim().toLowerCase().slice(0, 120);
}
function validEmail_(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function getEvent_() {
  try { return Object.assign({}, DEFAULT_EVENT, JSON.parse(PropertiesService.getScriptProperties().getProperty('event') || '{}')); }
  catch (e) { return DEFAULT_EVENT; }
}

// ---------------- Guest API ----------------

/** Everything the guest page needs on load. */
function boot() {
  return { all: rows_().map(x => publicRec_(x.r)), event: getEvent_(), families: FAMILIES };
}

/** A guest enters their email to load (and then change) their own RSVP. */
function findByEmail(email) {
  email = normEmail_(email);
  if (!validEmail_(email)) throw new Error('Please enter a valid email.');
  const hit = rows_().find(x => normEmail_(x.r[1]) === email);
  return hit ? privateRec_(hit.r) : null;
}

function save(input) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    input = input || {};
    const email = normEmail_(input.email);
    if (!validEmail_(email)) throw new Error('Please enter a valid email.');
    const all = rows_();
    const hit = all.find(x => normEmail_(x.r[1]) === email);
    let household;
    if (input.mode === 'update') {
      // Updating: the email must match an existing RSVP, and the family stays as it was.
      if (!hit) throw new Error('We couldn\'t find an RSVP for that email.');
      household = String(hit.r[3]);
    } else {
      // New RSVP: one per invited family, and one per email.
      household = FAMILIES.find(f => f === String(input.household || '').trim());
      if (!household) throw new Error('Please choose your family from the list.');
      if (hit) throw new Error('That email already has an RSVP. Tap “Update my RSVP” to change it.');
      if (all.some(x => String(x.r[3]).trim().toLowerCase() === household.toLowerCase())) {
        throw new Error(household + ' have already RSVP\'d. Use “Update my RSVP” with the email you used, or ask the hosts.');
      }
    }
    const d = clean_(Object.assign({}, input, { household: household }));
    const id = hit ? String(hit.r[0]) : Utilities.getUuid().slice(0, 8);
    const readable = d.dishes.map(x => x.name + ' [' + x.cat + ']').join('; ');
    const values = [id, str_(email, 120), new Date(), d.household, d.status, d.adults, d.kids, d.kidAges,
      d.contact, d.dietary, readable, d.extras, d.message, JSON.stringify(d.dishes)];
    const sh = sheet_();
    if (hit) sh.getRange(hit.row, 1, 1, values.length).setValues([values]);
    else sh.appendRow(values);
    const rows = rows_();
    const mine = rows.find(x => String(x.r[0]) === id);
    return { all: rows.map(x => publicRec_(x.r)), mine: mine ? privateRec_(mine.r) : null };
  } finally {
    lock.releaseLock();
  }
}

// ---------------- Host (admin) API ----------------
// Hosts sign in on the ?page=admin link with a 6-digit code emailed to them.
// Every admin call re-checks the session on the server.

function ownerAdmin_() {
  try {
    const e = normEmail_(Session.getActiveUser().getEmail());
    return ADMINS.indexOf(e) >= 0 ? e : '';
  } catch (x) { return ''; }
}
function sessionEmail_(token) {
  if (!token) return '';
  const raw = PropertiesService.getScriptProperties().getProperty('sess_' + token);
  if (!raw) return '';
  try {
    const s = JSON.parse(raw);
    if (s.exp > Date.now() && ADMINS.indexOf(s.email) >= 0) return s.email;
  } catch (e) {}
  return '';
}
function requireAdmin_(token) {
  const e = sessionEmail_(token) || ownerAdmin_();
  if (!e) throw new Error('Please sign in as a host.');
  return e;
}

/** Who (if anyone) is signed in as a host on this device. */
function adminCheck(token) {
  return { email: sessionEmail_(token) || ownerAdmin_() };
}

function adminSendCode(email) {
  email = normEmail_(email);
  if (ADMINS.indexOf(email) >= 0) {
    const cache = CacheService.getScriptCache();
    if (!cache.get('sent_' + email)) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      cache.put('code_' + email, code, 600);
      cache.put('tries_' + email, '0', 600);
      cache.put('sent_' + email, '1', 60);
      MailApp.sendEmail(email, 'Your __NAME__ host code: ' + code,
        'Your host sign-in code is ' + code + '.\n\nIt expires in 10 minutes. If you didn\'t ask for this, you can ignore it.');
    }
  }
  // Same answer either way, so the page never reveals who the hosts are.
  return { ok: true };
}

function adminVerify(email, code) {
  email = normEmail_(email);
  const cache = CacheService.getScriptCache();
  const expected = cache.get('code_' + email);
  const tries = Number(cache.get('tries_' + email) || 0) + 1;
  if (!expected || ADMINS.indexOf(email) < 0) throw new Error('That code has expired. Request a new one.');
  if (tries > 5) {
    cache.remove('code_' + email);
    throw new Error('Too many tries. Request a new code.');
  }
  cache.put('tries_' + email, String(tries), 600);
  if (String(code).trim() !== expected) throw new Error('That code doesn\'t match.');
  cache.remove('code_' + email);
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  Object.keys(all).forEach(k => {
    if (k.indexOf('sess_') === 0) {
      try { if (JSON.parse(all[k]).exp < Date.now()) props.deleteProperty(k); } catch (e) { props.deleteProperty(k); }
    }
  });
  const token = Utilities.getUuid() + Utilities.getUuid();
  props.setProperty('sess_' + token, JSON.stringify({ email: email, exp: Date.now() + SESSION_DAYS * 864e5 }));
  return { token: token, email: email };
}

function adminSignOut(token) {
  if (token) PropertiesService.getScriptProperties().deleteProperty('sess_' + token);
  return { ok: true };
}

function adminGetAll(token) {
  requireAdmin_(token);
  return rows_().map(x => privateRec_(x.r));
}

function adminSaveEvent(token, ev) {
  requireAdmin_(token);
  ev = ev || {};
  const t = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const clean = { date: t(ev.date, 60), time: t(ev.time, 60), where: t(ev.where, 120) };
  PropertiesService.getScriptProperties().setProperty('event', JSON.stringify(clean));
  return getEvent_();
}

function adminDelete(token, id) {
  requireAdmin_(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const hit = rows_().find(x => String(x.r[0]) === String(id));
    if (hit) sheet_().deleteRow(hit.row);
    return rows_().map(x => privateRec_(x.r));
  } finally {
    lock.releaseLock();
  }
}

/** Host-only: delete every RSVP row (keeps the header row). */
function adminClearAll(token) {
  requireAdmin_(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = sheet_();
    const last = sh.getLastRow();
    if (last >= 2) sh.deleteRows(2, last - 1);
    return [];
  } finally {
    lock.releaseLock();
  }
}

// ---------------- Helpers ----------------

// Plain text only: stop anything a guest types being treated as a spreadsheet formula.
function str_(v, max) {
  let s = String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function int_(v, lo, hi) {
  const n = Math.round(Number(v));
  return isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
}

function clean_(d) {
  d = d || {};
  const dishes = (Array.isArray(d.dishes) ? d.dishes : []).slice(0, 6)
    .map(x => ({
      name: str_(x && x.name, 60),
      cat: CATEGORIES.indexOf(x && x.cat) >= 0 ? x.cat : 'sides',
      tags: (Array.isArray(x && x.tags) ? x.tags : []).filter(t => TAGS.indexOf(t) >= 0)
    }))
    .filter(x => x.name);
  return {
    household: str_(d.household, 60),
    status: STATUSES.indexOf(d.status) >= 0 ? d.status : 'yes',
    adults: int_(d.adults, 0, 20),
    kids: int_(d.kids, 0, 20),
    kidAges: str_(d.kidAges, 100),
    contact: str_(d.contact, 80),
    dietary: str_(d.dietary, 200),
    extras: str_(d.extras, 120),
    message: str_(d.message, 200),
    dishes: dishes
  };
}
