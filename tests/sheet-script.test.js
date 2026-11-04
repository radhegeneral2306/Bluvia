// Unit tests for integrations/google-sheet/Code.gs (Google Apps Script) using fakes for Firestore REST and Sheets.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const CODE = readFileSync('integrations/google-sheet/Code.gs', 'utf8');
const TS_KEYS = new Set(['createdAt', 'updatedAt', 'lastTxnAt']);

function enc(v, key) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return TS_KEYS.has(key) ? { timestampValue: v } : { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map((x) => enc(x)) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x, k)])) } };
}
const encDoc = (col, d) => {
  const { id, ...rest } = d;
  return { name: `projects/p/databases/(default)/documents/${col}/${id}`, fields: Object.fromEntries(Object.entries(rest).map(([k, x]) => [k, enc(x, k)])) };
};

function makeWorld() {
  const db = { transactions: [], jarTypes: [], parties: [], stats: [], settings: [] };
  const sheets = new Map();
  const props = {};
  const newSheet = (name) => {
    const s = { name, data: [], frozen: 0 };
    const rng = (r, c, nr, nc) => ({
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (s.data[r - 1 + i] || [])[c - 1 + j] ?? '')),
      setValues(vals) { vals.forEach((row, i) => { s.data[r - 1 + i] ||= []; row.forEach((x, j) => { s.data[r - 1 + i][c - 1 + j] = x; }); }); return this; },
      setFontWeight() { return this; }, setBackground() { return this; },
    });
    return {
      _s: s, getName: () => name, getLastRow: () => s.data.length, getLastColumn: () => s.data.reduce((m, r) => Math.max(m, r.length), 0),
      getRange: rng, clear() { s.data = []; return this; }, setFrozenRows(n) { s.frozen = n; }, setColumnWidth() {},
    };
  };
  const ss = {
    getSheetByName: (n) => sheets.get(n) || null,
    insertSheet: (n) => { const s = newSheet(n); sheets.set(n, s); return s; },
    getSheets: () => [...sheets.values()], deleteSheet: (s) => sheets.delete(s.getName()),
  };
  const calls = [];
  const fetch = (url, opts) => {
    calls.push(url);
    const body = opts.payload ? JSON.parse(opts.payload) : null;
    const ok = (obj) => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify(obj) });
    if (url.includes(':runQuery')) {
      const q = body.structuredQuery;
      let docs = db.transactions.slice();
      const w = q.where && q.where.fieldFilter;
      if (w) docs = docs.filter((d) => Date.parse(d.updatedAt) >= Date.parse(w.value.timestampValue));
      docs.sort((a, b) => (Date.parse(a.updatedAt) - Date.parse(b.updatedAt)) || (a.id < b.id ? -1 : 1));
      if (q.startAt) {
        const ts = q.startAt.values[0].timestampValue; const idRef = q.startAt.values[1].referenceValue.split('/').pop();
        docs = docs.filter((d) => Date.parse(d.updatedAt) > Date.parse(ts) || (Date.parse(d.updatedAt) === Date.parse(ts) && d.id > idRef));
      }
      return ok(docs.slice(0, q.limit).map((d) => ({ document: encDoc('transactions', d) })));
    }
    const m = url.match(/documents\/(\w+)(?:\/(\w+))?/);
    if (m && m[2]) { const d = db[m[1]].find((x) => x.id === m[2]); return ok(encDoc(m[1], d)); }
    if (m) return ok({ documents: db[m[1]].map((d) => encDoc(m[1], d)) });
    return { getResponseCode: () => 404, getContentText: () => 'nope' };
  };
  const ctx = vm.createContext({
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, getUi: () => ({ alert() {}, createMenu: () => ({ addItem() { return this; }, addSeparator() { return this; }, addToUi() {} }) }) },
    UrlFetchApp: { fetch }, ScriptApp: { getOAuthToken: () => 'tok', getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyMinutes() { return this; }, everyDays() { return this; }, atHour() { return this; }, create() {} }) }), deleteTrigger() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: { formatDate: () => '2026-11-04 10:00:00' }, Session: { getScriptTimeZone: () => 'Asia/Kolkata' }, Logger: { log() {} }, JSON, Date, Math, Object, Array, String, Number, RegExp, Error,
  });
  vm.runInContext(CODE, ctx);
  return { db, sheets, props, ctx, calls, log: () => (sheets.get('Log') ? sheets.get('Log')._s.data : []) };
}

const tx = (id, over = {}) => ({
  id, type: 'receipt', partyId: 'p1', partyName: 'Ram Traders', dateKey: '2026-11-04', amount: 30000, mode: 'Cash', reference: '', note: '',
  deleted: false, createdAt: '2026-11-04T04:00:00.000000Z', updatedAt: '2026-11-04T04:00:00.000000Z', ...over,
});
let t0 = Date.parse('2026-11-04T04:00:00Z');
const at = (sec) => new Date(t0 + sec * 1000).toISOString().replace('Z', '123Z').replace('.123123Z', '.123456Z');

describe('row building', () => {
  let w;
  beforeEach(() => { w = makeWorld(); w.db.jarTypes.push({ id: 'j20', name: '20L Jar' }, { id: 'j10', name: '10L Jar' }); });
  const rowFor = (t) => {
    const jt = w.ctx.listCollection_('jarTypes');
    const header = w.ctx.LOG_FIXED.concat(w.ctx.jarHeaderNames_(jt));
    const row = w.ctx.buildLogRow_(t, header, jt, 'now');
    return Object.fromEntries(header.map((h, i) => [h, row[i]]));
  };

  it('decodes Firestore REST values', () => {
    const d = w.ctx.decodeDoc_(encDoc('x', { id: 'a1', n: 5, s: 'x', b: true, nul: null, m: { k: 1 }, arr: [1, 'z'], updatedAt: '2026-01-01T00:00:00.5Z' }));
    expect(JSON.parse(JSON.stringify(d))).toEqual({ id: 'a1', n: 5, s: 'x', b: true, nul: null, m: { k: 1 }, arr: [1, 'z'], updatedAt: '2026-01-01T00:00:00.5Z' });
  });

  it('bill: total in rupees, jars given per type, returnedInBill not double counted', () => {
    const r = rowFor(tx('b1', { type: 'bill', billNo: '00104', total: 40000, discount: 500, extraCharge: 0, returnedInBill: { j20: 3 },
      lines: [{ jarTypeId: 'j20', qty: 10, jarGiven: true }, { jarTypeId: 'j10', qty: 2, jarGiven: false }, { jarTypeId: null, qty: 4 }] }));
    expect(r.Type).toBe('Bill'); expect(r['Bill no']).toBe('00104'); expect(r['Amount / Total (Rs)']).toBe(400); expect(r['Discount (Rs)']).toBe(5);
    expect(r['Given: 20L Jar']).toBe(10); expect(r['Given: 10L Jar']).toBe(''); expect(r['Returned: 20L Jar']).toBe('');
    expect(r.Event).toBe('Created');
  });

  it('receipt, jar entries, deposits and adjustment', () => {
    expect(rowFor(tx('r', { amount: 12550 }))['Amount / Total (Rs)']).toBe(125.5);
    expect(rowFor(tx('r', { amount: 12550, mode: 'UPI', reference: 'UTR1' })).Mode).toBe('UPI');
    expect(rowFor(tx('j', { type: 'jarReturn', jarTypeId: 'j20', qty: 3, amount: undefined }))['Returned: 20L Jar']).toBe(3);
    expect(rowFor(tx('j', { type: 'jarGiven', jarTypeId: 'j10', qty: 2 }))['Given: 10L Jar']).toBe(2);
    expect(rowFor(tx('d', { type: 'depositTaken', amount: 100000 }))['Deposit (Rs)']).toBe(1000);
    expect(rowFor(tx('d', { type: 'depositRefund', amount: 20000 }))['Deposit (Rs)']).toBe(-200);
    expect(rowFor(tx('d', { type: 'depositAdjust', amount: 10000 }))['Deposit (Rs)']).toBe(-100);
    expect(rowFor(tx('a', { type: 'adjustment', amount: -5000 }))['Amount / Total (Rs)']).toBe(-50);
  });

  it('event: Created, Updated, Deleted', () => {
    expect(rowFor(tx('e')).Event).toBe('Created');
    expect(rowFor(tx('e', { updatedAt: '2026-11-04T05:00:00.000000Z' })).Event).toBe('Updated');
    expect(rowFor(tx('e', { deleted: true })).Event).toBe('Deleted');
    expect(rowFor(tx('e', { deleted: true }))['Deleted']).toBe('YES');
  });
});

describe('syncLog (fake Firestore + fake Sheet)', () => {
  let w;
  beforeEach(() => { w = makeWorld(); w.db.jarTypes.push({ id: 'j20', name: '20L Jar' }); w.ctx.CONFIG.BATCH = 2; });
  const ids = () => w.log().slice(1).map((r) => r[2]);

  it('first run backfills everything across pages, second run adds nothing', () => {
    for (let i = 1; i <= 5; i++) w.db.transactions.push(tx('t' + i, { createdAt: at(i), updatedAt: at(i) }));
    w.ctx.syncLog();
    expect(ids()).toEqual(['t1', 't2', 't3', 't4', 't5']);
    w.ctx.syncLog();
    expect(ids()).toHaveLength(5);
  });

  it('documents sharing one timestamp are never lost or repeated, even when a page ends between them', () => {
    const same = at(10);
    for (const id of ['a', 'b', 'c', 'd', 'e']) w.db.transactions.push(tx(id, { createdAt: same, updatedAt: same }));
    w.ctx.syncLog();
    expect(ids().sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    w.db.transactions.push(tx('f', { createdAt: same, updatedAt: same })); // late commit, identical timestamp
    w.ctx.syncLog(); w.ctx.syncLog();
    expect(ids().sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('an edit and a delete add NEW rows; nothing is overwritten', () => {
    const t = tx('r1', { createdAt: at(1), updatedAt: at(1) });
    w.db.transactions.push(t);
    w.ctx.syncLog();
    t.amount = 50000; t.updatedAt = at(100);
    w.ctx.syncLog();
    t.deleted = true; t.updatedAt = at(200);
    w.ctx.syncLog();
    const rows = w.log().slice(1);
    expect(rows.map((r) => r[1])).toEqual(['Created', 'Updated', 'Deleted']);
    expect(rows[0][9]).toBe(300); expect(rows[1][9]).toBe(500);
  });

  it('a late-arriving document stamped slightly before the cursor is still picked up (5 minute overlap)', () => {
    w.db.transactions.push(tx('x1', { createdAt: at(1000), updatedAt: at(1000) }));
    w.ctx.syncLog();
    w.db.transactions.push(tx('late', { createdAt: at(800), updatedAt: at(800) })); // 200 seconds earlier than the cursor
    w.ctx.syncLog();
    expect(ids().sort()).toEqual(['late', 'x1']);
    w.ctx.syncLog();
    expect(ids()).toHaveLength(2);
  });

  it('adds a column when a new jar type appears and keeps old rows intact', () => {
    w.db.transactions.push(tx('b1', { type: 'jarGiven', jarTypeId: 'j20', qty: 2, createdAt: at(1), updatedAt: at(1) }));
    w.ctx.syncLog();
    w.db.jarTypes.push({ id: 'j10', name: '10L Jar' });
    w.db.transactions.push(tx('b2', { type: 'jarGiven', jarTypeId: 'j10', qty: 7, createdAt: at(50), updatedAt: at(50) }));
    w.ctx.syncLog();
    const [header, r1, r2] = w.log();
    expect(header).toContain('Given: 10L Jar');
    expect(r1[header.indexOf('Given: 20L Jar')]).toBe(2);
    expect(r2[header.indexOf('Given: 10L Jar')]).toBe(7);
  });

  it('records a FAILED status and rethrows when Firestore refuses', () => {
    w.ctx.UrlFetchApp.fetch = () => ({ getResponseCode: () => 403, getContentText: () => '{"error":"denied"}' });
    expect(() => w.ctx.syncLog()).toThrow(/403/);
    const status = w.sheets.get('Status')._s.data.map((r) => r.join('|')).join('\n');
    expect(status).toContain('FAILED');
  });
});

describe('refreshParties', () => {
  it('writes Parties, Daily and Status totals in rupees', () => {
    const w = makeWorld();
    w.db.jarTypes.push({ id: 'j20', name: '20L Jar' });
    w.db.parties.push({ id: 'p2', name: 'Zed', outstanding: 12345, depositBalance: 50000, jarBalance: { j20: 4 }, active: true, openingBalance: 0 },
      { id: 'p1', name: 'adam', outstanding: -500, depositBalance: 0, jarBalance: {}, active: false, openingBalance: 100 });
    w.db.stats.push({ id: 'summary', totalOutstanding: 11845, totalDepositHeld: 50000, totalJarsOut: { j20: 4 } },
      { id: 'daily_2026-11-03', dateKey: '2026-11-03', sales: 10000, collection: 2000, billsCount: 2 },
      { id: 'daily_2026-11-04', dateKey: '2026-11-04', sales: 99900, collection: 0, billsCount: 1 });
    w.ctx.refreshParties();
    const parties = w.sheets.get('Parties')._s.data;
    expect(parties[0]).toContain('Outstanding (Rs)');
    expect(parties[1][0]).toBe('adam'); expect(parties[1][4]).toBe(-5); expect(parties[1][3]).toBe('No');
    expect(parties[2][0]).toBe('Zed'); expect(parties[2][4]).toBe(123.45); expect(parties[2][5]).toBe(500); expect(parties[2][6]).toBe('4 x 20L Jar');
    const daily = w.sheets.get('Daily')._s.data;
    expect(daily[1][1]).toBe(999); expect(daily[1][3]).toBe(1);   // newest first
    expect(daily[2][1]).toBe(100);
    const status = Object.fromEntries(w.sheets.get('Status')._s.data.slice(1));
    expect(status['Total outstanding (Rs)']).toBe(118.45); expect(status['Total deposit held (Rs)']).toBe(500); expect(status['Jars out']).toBe('4 x 20L Jar');
  });
});
