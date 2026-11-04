/**
 * Bluvia -> Google Sheet backup (one way: app to sheet, never sheet to app).
 *
 * How it works:
 *  - This script lives INSIDE the Google Sheet (Extensions > Apps Script).
 *  - Every 10 minutes it asks Firestore for transactions created or changed since the last run and appends them
 *    to the "Log" tab (append-only: an edit or a delete adds a new row, nothing is overwritten).
 *  - Once a day (and on demand) it rewrites the "Parties" tab (balances) and the "Daily" tab (sales and collection).
 *  - It uses YOUR Google login (OAuth), so there is no key or password to store anywhere.
 *
 * Read docs: integrations/google-sheet/GUIDE.md (step by step setup).
 * Money in Firestore is stored in paise; this sheet shows rupees.
 */

var CONFIG = {
  PROJECT_ID: 'bluvia-0027',   // Firebase project id (Firebase console > Project settings)
  SYNC_MINUTES: 10,            // how often the Log is refreshed (allowed: 1, 5, 10, 15, 30)
  PARTIES_HOUR: 2,             // hour of day (0-23) for the daily Parties and Daily refresh
  BATCH: 300,                  // documents per Firestore query
  MAX_RUN_MS: 4 * 60 * 1000,   // stop a run after 4 minutes (Apps Script limit is 6)
  OVERLAP_SEC: 300,            // re-read the last 5 minutes every run so late commits are never missed
};

var TABS = { LOG: 'Log', PARTIES: 'Parties', DAILY: 'Daily', STATUS: 'Status' };

var LOG_FIXED = [
  'Synced at', 'Event', 'Txn ID', 'Updated at', 'Date', 'Type', 'Bill no', 'Party', 'Party ID',
  'Amount / Total (Rs)', 'Discount (Rs)', 'Extra charge (Rs)', 'Deposit (Rs)', 'Mode', 'Reference', 'Note', 'Deleted',
];

var TYPE_LABELS = {
  bill: 'Bill', receipt: 'Receipt', jarReturn: 'Jar return', jarGiven: 'Jar given',
  depositTaken: 'Deposit taken', depositRefund: 'Deposit refund', depositAdjust: 'Deposit adjusted', adjustment: 'Adjustment',
};

// ---------------------------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------------------------
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Bluvia Backup')
    .addItem('1. Setup (first time)', 'setup')
    .addSeparator()
    .addItem('Sync now', 'syncLog')
    .addItem('Refresh parties and daily summary', 'refreshParties')
    .addItem('Check connection', 'checkConnection')
    .addToUi();
}

// ---------------------------------------------------------------------------------------------
// Firestore REST helpers (OAuth token of the person who owns this script)
// ---------------------------------------------------------------------------------------------
function baseUrl_() {
  return 'https://firestore.googleapis.com/v1/projects/' + CONFIG.PROJECT_ID + '/databases/(default)/documents';
}

function fs_(urlSuffix, method, body) {
  var res = UrlFetchApp.fetch(baseUrl_() + urlSuffix, {
    method: method || 'get',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: body ? JSON.stringify(body) : undefined,
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code >= 300) throw new Error(explainHttp_(code, text));
  return JSON.parse(text);
}

function explainHttp_(code, text) {
  var msg = String(text || '').slice(0, 300);
  if (code === 403) {
    return 'Firestore ne mana kar diya (403). Check karo: (1) Apps Script ka Google Cloud project Firebase project se jura hai, ' +
      '(2) is Google account ko Firebase project mein access hai, (3) OAuth consent screen test user. Detail: ' + msg;
  }
  if (code === 401) return 'Login/authorization nahi mila (401). Setup dobara chalao aur permissions allow karo. Detail: ' + msg;
  if (code === 404) return 'Project ya database nahi mila (404). CONFIG.PROJECT_ID check karo. Detail: ' + msg;
  return 'Firestore error ' + code + ': ' + msg;
}

function decodeValue_(v) {
  if (v === null || v === undefined) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return decodeFields_(v.mapValue.fields || {});
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue_);
  return null;
}

function decodeFields_(fields) {
  var out = {};
  Object.keys(fields || {}).forEach(function (k) { out[k] = decodeValue_(fields[k]); });
  return out;
}

function decodeDoc_(doc) {
  var out = decodeFields_(doc.fields || {});
  out.id = String(doc.name).split('/').pop();
  return out;
}

/** All documents of a (small) collection, following page tokens. */
function listCollection_(name) {
  var docs = [];
  var token = '';
  do {
    var data = fs_('/' + name + '?pageSize=300' + (token ? '&pageToken=' + encodeURIComponent(token) : ''));
    (data.documents || []).forEach(function (d) { docs.push(decodeDoc_(d)); });
    token = data.nextPageToken || '';
  } while (token);
  return docs;
}

function docName_(collection, id) {
  return 'projects/' + CONFIG.PROJECT_ID + '/databases/(default)/documents/' + collection + '/' + id;
}

/** Transactions with updatedAt >= sinceIso (or all), oldest first. `after` = last doc of the previous page (exact paging,
 *  even when many documents share one timestamp). */
function queryTransactions_(sinceIso, limit, after) {
  var q = {
    from: [{ collectionId: 'transactions' }],
    orderBy: [{ field: { fieldPath: 'updatedAt' }, direction: 'ASCENDING' }, { field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
    limit: limit,
  };
  if (after) {
    q.startAt = { values: [{ timestampValue: after.updatedAt }, { referenceValue: docName_('transactions', after.id) }], before: false };
  }
  if (sinceIso) {
    q.where = { fieldFilter: { field: { fieldPath: 'updatedAt' }, op: 'GREATER_THAN_OR_EQUAL', value: { timestampValue: sinceIso } } };
  }
  var rows = fs_(':runQuery', 'post', { structuredQuery: q });
  var docs = [];
  (rows || []).forEach(function (r) { if (r.document) docs.push(decodeDoc_(r.document)); });
  return docs;
}

// ---------------------------------------------------------------------------------------------
// Row building (pure functions, unit tested)
// ---------------------------------------------------------------------------------------------
function rupees_(paise) {
  if (paise === null || paise === undefined || paise === '' || isNaN(Number(paise))) return '';
  return Math.round(Number(paise)) / 100;
}

function dateFromKey_(key) {
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return key || '';
  var p = key.split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function eventOf_(t) {
  if (t.deleted) return 'Deleted';
  var c = Date.parse(t.createdAt || ''), u = Date.parse(t.updatedAt || '');
  if (!isNaN(c) && !isNaN(u) && Math.abs(u - c) < 2000) return 'Created';
  return 'Updated';
}

/** Jars given / returned by one transaction, as { jarTypeId: qty }. A bill's own returnedInBill is NOT counted:
 *  those jars are separate jarReturn entries and appear as their own rows. */
function jarMovement_(t) {
  var given = {}, returned = {};
  if (t.type === 'bill') {
    (t.lines || []).forEach(function (l) {
      if (l.jarTypeId && l.jarGiven) given[l.jarTypeId] = (given[l.jarTypeId] || 0) + (l.qty || 0);
    });
  } else if (t.type === 'jarGiven' && t.jarTypeId) {
    given[t.jarTypeId] = t.qty || 0;
  } else if (t.type === 'jarReturn' && t.jarTypeId) {
    returned[t.jarTypeId] = t.qty || 0;
  }
  return { given: given, returned: returned };
}

/** header = full header row (fixed + jar columns); jarTypes = [{id,name}] */
function buildLogRow_(t, header, jarTypes, syncedAt) {
  var row = new Array(header.length);
  for (var i = 0; i < row.length; i++) row[i] = '';
  var set = function (name, value) { var idx = header.indexOf(name); if (idx >= 0) row[idx] = value; };
  var amountCol = '';
  var depositCol = '';
  if (t.type === 'bill') amountCol = rupees_(t.total);
  else if (t.type === 'receipt') amountCol = rupees_(t.amount);
  else if (t.type === 'adjustment') amountCol = rupees_(t.amount);
  else if (t.type === 'depositTaken') depositCol = rupees_(t.amount);
  else if (t.type === 'depositRefund' || t.type === 'depositAdjust') depositCol = t.amount ? -rupees_(t.amount) : 0;
  set('Synced at', syncedAt);
  set('Event', eventOf_(t));
  set('Txn ID', t.id);
  set('Updated at', t.updatedAt || '');
  set('Date', dateFromKey_(t.dateKey));
  set('Type', TYPE_LABELS[t.type] || t.type || '');
  set('Bill no', t.billNo || '');
  set('Party', t.partyName || '');
  set('Party ID', t.partyId || '');
  set('Amount / Total (Rs)', amountCol);
  set('Discount (Rs)', t.type === 'bill' ? rupees_(t.discount || 0) : '');
  set('Extra charge (Rs)', t.type === 'bill' ? rupees_(t.extraCharge || 0) : '');
  set('Deposit (Rs)', depositCol);
  set('Mode', t.mode || '');
  set('Reference', t.reference || '');
  set('Note', t.note || '');
  set('Deleted', t.deleted ? 'YES' : '');
  var mv = jarMovement_(t);
  (jarTypes || []).forEach(function (j) {
    if (mv.given[j.id]) set('Given: ' + j.name, mv.given[j.id]);
    if (mv.returned[j.id]) set('Returned: ' + j.name, mv.returned[j.id]);
  });
  return row;
}

function jarHeaderNames_(jarTypes) {
  var out = [];
  (jarTypes || []).forEach(function (j) { out.push('Given: ' + j.name); });
  (jarTypes || []).forEach(function (j) { out.push('Returned: ' + j.name); });
  return out;
}

function shiftIso_(iso, seconds) {
  var ms = Date.parse(iso);
  if (isNaN(ms)) return iso;
  return new Date(ms + seconds * 1000).toISOString();
}

function docKey_(t) { return t.id + '|' + t.updatedAt; }

// ---------------------------------------------------------------------------------------------
// Sheet helpers
// ---------------------------------------------------------------------------------------------
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function tab_(name) {
  var s = ss_().getSheetByName(name);
  if (!s) s = ss_().insertSheet(name);
  return s;
}

/** Makes sure the Log tab has all fixed columns and one Given/Returned column per jar type (adds new ones on the right). */
function ensureLogHeader_(jarTypes) {
  var sheet = tab_(TABS.LOG);
  var want = LOG_FIXED.concat(jarHeaderNames_(jarTypes));
  var lastCol = sheet.getLastColumn();
  var have = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].filter(function (x) { return x !== ''; }) : [];
  var header = have.slice();
  want.forEach(function (name) { if (header.indexOf(name) < 0) header.push(name); });
  if (header.length !== have.length || have.length === 0) {
    sheet.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold').setBackground('#e6f6f9');
    sheet.setFrozenRows(1);
  }
  return header;
}

function writeStatus_(pairs) {
  var sheet = tab_(TABS.STATUS);
  var existing = {};
  var last = sheet.getLastRow();
  if (last > 0) sheet.getRange(1, 1, last, 2).getValues().forEach(function (r) { if (r[0]) existing[r[0]] = r[1]; });
  Object.keys(pairs).forEach(function (k) { existing[k] = pairs[k]; });
  var order = [
    'Last log sync', 'Last result', 'Rows added in last run', 'Total log rows', 'Log cursor (updatedAt)',
    'Parties refreshed', 'Total outstanding (Rs)', 'Total deposit held (Rs)', 'Jars out', 'Last error',
  ];
  var keys = order.filter(function (k) { return k in existing; });
  Object.keys(existing).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); });
  var values = keys.map(function (k) { return [k, existing[k]]; });
  sheet.clear();
  sheet.getRange(1, 1, 1, 2).setValues([['Bluvia backup status', '']]).setFontWeight('bold').setBackground('#e6f6f9');
  if (values.length) sheet.getRange(2, 1, values.length, 2).setValues(values);
  sheet.setColumnWidth(1, 220); sheet.setColumnWidth(2, 420);
}

function nowText_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'); }

// ---------------------------------------------------------------------------------------------
// Sync: Log
// ---------------------------------------------------------------------------------------------
function syncLog() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return; // another run is still going
  var added = 0;
  try {
    var props = PropertiesService.getScriptProperties();
    var jarTypes = listCollection_('jarTypes');
    var header = ensureLogHeader_(jarTypes);
    var sheet = tab_(TABS.LOG);
    var cursor = props.getProperty('cursor') || '';
    var seen = {};
    try { JSON.parse(props.getProperty('seen') || '[]').forEach(function (k) { seen[k] = true; }); } catch (e) { seen = {}; }
    var started = Date.now();
    var since = cursor ? shiftIso_(cursor, -CONFIG.OVERLAP_SEC) : '';
    var processed = []; // keys handled in this run, for the seen list
    var lastTs = cursor;
    var syncedAt = nowText_();

    var after = null;
    for (;;) {
      var docs = queryTransactions_(since, CONFIG.BATCH, after);
      var fresh = docs.filter(function (d) { return !seen[docKey_(d)]; });
      if (fresh.length) {
        var rows = fresh.map(function (d) { return buildLogRow_(d, header, jarTypes, syncedAt); });
        var startRow = sheet.getLastRow() + 1;
        sheet.getRange(startRow, 1, rows.length, header.length).setValues(rows);
        added += rows.length;
      }
      docs.forEach(function (d) { seen[docKey_(d)] = true; processed.push({ key: docKey_(d), ts: d.updatedAt }); });
      if (docs.length) lastTs = docs[docs.length - 1].updatedAt;
      if (docs.length < CONFIG.BATCH) break;                // caught up
      if (Date.now() - started > CONFIG.MAX_RUN_MS) break;  // continue in the next run
      after = docs[docs.length - 1];
    }

    // keep only recent keys (last overlap window) so the list stays small
    var floor = lastTs ? shiftIso_(lastTs, -CONFIG.OVERLAP_SEC) : '';
    var keep = processed.filter(function (p) { return !floor || Date.parse(p.ts) >= Date.parse(floor); }).map(function (p) { return p.key; });
    var json = JSON.stringify(keep);
    while (json.length > 8000 && keep.length) { keep = keep.slice(Math.ceil(keep.length / 4)); json = JSON.stringify(keep); }
    props.setProperty('seen', json);
    if (lastTs) props.setProperty('cursor', lastTs);

    writeStatus_({
      'Last log sync': nowText_(), 'Last result': 'OK', 'Rows added in last run': added,
      'Total log rows': Math.max(0, sheet.getLastRow() - 1), 'Log cursor (updatedAt)': lastTs || '(nothing yet)', 'Last error': '',
    });
  } catch (err) {
    try { writeStatus_({ 'Last log sync': nowText_(), 'Last result': 'FAILED', 'Last error': String(err && err.message ? err.message : err) }); } catch (e2) { /* ignore */ }
    throw err;
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------------------------
// Sync: Parties + Daily + Status totals (daily, or on demand)
// ---------------------------------------------------------------------------------------------
function buildPartyRows_(parties, jarTypes) {
  var header = ['Party', 'Phone', 'Address', 'Active', 'Outstanding (Rs)', 'Deposit held (Rs)', 'Jars with party']
    .concat(jarTypes.map(function (j) { return 'Jars: ' + j.name; }))
    .concat(['Opening balance (Rs)', 'Last entry', 'Party ID']);
  var sorted = parties.slice().sort(function (a, b) { return String(a.name || '').toLowerCase() < String(b.name || '').toLowerCase() ? -1 : 1; });
  var rows = sorted.map(function (p) {
    var jb = p.jarBalance || {};
    var text = jarTypes.filter(function (j) { return jb[j.id]; }).map(function (j) { return jb[j.id] + ' x ' + j.name; }).join(', ');
    return [p.name || '', p.phone || '', p.address || '', p.active === false ? 'No' : 'Yes', rupees_(p.outstanding || 0), rupees_(p.depositBalance || 0), text]
      .concat(jarTypes.map(function (j) { return jb[j.id] || 0; }))
      .concat([rupees_(p.openingBalance || 0), p.lastTxnAt || '', p.id]);
  });
  return { header: header, rows: rows };
}

function buildDailyRows_(statsDocs) {
  var daily = statsDocs.filter(function (d) { return /^daily_/.test(d.id); })
    .map(function (d) { return { date: d.dateKey || d.id.slice(6), sales: d.sales || 0, collection: d.collection || 0, bills: d.billsCount || 0 }; })
    .sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  return daily.map(function (x) { return [dateFromKey_(x.date), rupees_(x.sales), rupees_(x.collection), x.bills]; });
}

function refreshParties() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    var jarTypes = listCollection_('jarTypes');
    var parties = listCollection_('parties');
    var p = buildPartyRows_(parties, jarTypes);
    var ps = tab_(TABS.PARTIES);
    ps.clear();
    ps.getRange(1, 1, 1, p.header.length).setValues([p.header]).setFontWeight('bold').setBackground('#e6f6f9');
    if (p.rows.length) ps.getRange(2, 1, p.rows.length, p.header.length).setValues(p.rows);
    ps.setFrozenRows(1);

    var stats = listCollection_('stats');
    var daily = buildDailyRows_(stats);
    var ds = tab_(TABS.DAILY);
    ds.clear();
    ds.getRange(1, 1, 1, 4).setValues([['Date', 'Sales (Rs)', 'Collection (Rs)', 'Bills']]).setFontWeight('bold').setBackground('#e6f6f9');
    if (daily.length) ds.getRange(2, 1, daily.length, 4).setValues(daily);
    ds.setFrozenRows(1);

    var summary = stats.filter(function (d) { return d.id === 'summary'; })[0] || {};
    var jarsOut = jarTypes.filter(function (j) { return (summary.totalJarsOut || {})[j.id]; })
      .map(function (j) { return summary.totalJarsOut[j.id] + ' x ' + j.name; }).join(', ');
    writeStatus_({
      'Parties refreshed': nowText_(), 'Total outstanding (Rs)': rupees_(summary.totalOutstanding || 0),
      'Total deposit held (Rs)': rupees_(summary.totalDepositHeld || 0), 'Jars out': jarsOut || 'none',
    });
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------------------------
// Setup + diagnostics
// ---------------------------------------------------------------------------------------------
function ensureTabs_() {
  var first = ss_().getSheets()[0];
  [TABS.LOG, TABS.PARTIES, TABS.DAILY, TABS.STATUS].forEach(function (n) { tab_(n); });
  // remove the empty default tab if it is still untouched
  if (first && /^Sheet\d*$/.test(first.getName()) && first.getLastRow() === 0 && ss_().getSheets().length > 1) ss_().deleteSheet(first);
}

function checkConnection() {
  var data = fs_('/settings/main');
  var s = decodeDoc_(data);
  var msg = 'Connection OK. Business: ' + (s.businessName || '(name not set)') + '. Next bill number: ' + (s.nextBillNo || '?') + '.';
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
  return msg;
}

function setup() {
  ensureTabs_();
  checkConnection(); // fails with a clear message if access or project link is wrong
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (fn === 'syncLog' || fn === 'refreshParties') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncLog').timeBased().everyMinutes(CONFIG.SYNC_MINUTES).create();
  ScriptApp.newTrigger('refreshParties').timeBased().everyDays(1).atHour(CONFIG.PARTIES_HOUR).create();
  syncLog();
  refreshParties();
  var msg = 'Setup complete. Auto sync runs every ' + CONFIG.SYNC_MINUTES + ' minutes. See the Status tab.';
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
}
