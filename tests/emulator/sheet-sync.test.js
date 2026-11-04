// End-to-end test: the REAL integrations/google-sheet/Code.gs against the Firestore EMULATOR.
// Run with:
//   npx firebase emulators:exec --only firestore --project demo-bluvia \
//     "npx vitest run -c vitest.emulator.config.js tests/emulator/sheet-sync.test.js"
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

const OWNER = 'test-owner-uid';
vi.mock('../../src/lib/firebase.js', async () => {
  const { initializeApp } = await import('firebase/app');
  const { getFirestore, connectFirestoreEmulator } = await import('firebase/firestore');
  const app = initializeApp({ projectId: 'demo-bluvia', apiKey: 'fake', appId: 'fake' });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080, { mockUserToken: { sub: 'test-owner-uid' } });
  return { db, auth: null, app, configured: true };
});

const api = await import('../../src/data/api.js');
const { db } = await import('../../src/lib/firebase.js');
const { collection, doc, getDocs, getDoc } = await import('firebase/firestore');

// ---------------------------------------------------------------------------------------------
// Apps Script runtime stubs
// ---------------------------------------------------------------------------------------------
function makeSheet(name) {
  const sheet = {
    data: [],
    getName: () => name,
    getLastRow() {
      for (let r = sheet.data.length; r > 0; r--) if ((sheet.data[r - 1] || []).some((v) => v !== '' && v !== undefined)) return r;
      return 0;
    },
    getLastColumn() {
      let max = 0;
      sheet.data.forEach((row) => { for (let c = (row || []).length; c > 0; c--) if (row[c - 1] !== '' && row[c - 1] !== undefined) { max = Math.max(max, c); break; } });
      return max;
    },
    getRange(r, c, nr = 1, nc = 1) {
      const rng = {
        getValues() {
          const out = [];
          for (let i = 0; i < nr; i++) {
            const row = [];
            for (let j = 0; j < nc; j++) { const v = (sheet.data[r - 1 + i] || [])[c - 1 + j]; row.push(v === undefined ? '' : v); }
            out.push(row);
          }
          return out;
        },
        setValues(vals) {
          vals.forEach((row, i) => {
            sheet.data[r - 1 + i] = sheet.data[r - 1 + i] || [];
            row.forEach((v, j) => { sheet.data[r - 1 + i][c - 1 + j] = v; });
          });
          return rng;
        },
        setFontWeight: () => rng,
        setBackground: () => rng,
      };
      return rng;
    },
    clear() { sheet.data = []; return sheet; },
    maxRows: 1000, maxCols: 26,
    getMaxRows() { return sheet.maxRows; }, getMaxColumns() { return sheet.maxCols; },
    insertRowsAfter(_a, n) { sheet.maxRows += n; }, insertColumnsAfter(_a, n) { sheet.maxCols += n; },
    setFrozenRows() {},
    setColumnWidth() {},
  };
  return sheet;
}

function loadScript() {
  const sheets = [makeSheet('Sheet1')];
  const spreadsheet = {
    getSheetByName: (n) => sheets.find((s) => s.getName() === n) || null,
    insertSheet: (n) => { const s = makeSheet(n); sheets.push(s); return s; },
    getSheets: () => sheets.slice(),
    deleteSheet: (s) => { sheets.splice(sheets.indexOf(s), 1); },
  };
  const props = {};
  const sandbox = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet, getUi: () => ({ createMenu: () => ({ addItem() { return this; }, addSeparator() { return this; }, addToUi() {} }), alert() {} }) },
    ScriptApp: { getOAuthToken: () => 'owner', getProjectTriggers: () => [], deleteTrigger() {}, newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create() {} }), everyDays: () => ({ atHour: () => ({ create() {} }) }) }) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: { formatDate: (d) => d.toISOString().replace('T', ' ').slice(0, 19) },
    Session: { getScriptTimeZone: () => 'UTC' },
    Logger: { log() {} },
    UrlFetchApp: {
      // SYNCHRONOUS, like the real Apps Script one: shell out to curl against the emulator.
      fetch(url, opts = {}) {
        const target = url.replace('https://firestore.googleapis.com', 'http://127.0.0.1:8080');
        const args = ['-s', '--globoff', '-X', String(opts.method || 'get').toUpperCase(),
          '-H', `Authorization: ${(opts.headers || {}).Authorization}`, '-H', 'Content-Type: application/json'];
        if (opts.payload) args.push('--data-binary', opts.payload);
        args.push('-w', '\n%{http_code}', target);
        const out = execFileSync('curl', args, { maxBuffer: 64 * 1024 * 1024 }).toString();
        const i = out.lastIndexOf('\n');
        const body = out.slice(0, i);
        const code = Number(out.slice(i + 1));
        return { getResponseCode: () => code, getContentText: () => body };
      },
    },
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(readFileSync('integrations/google-sheet/Code.gs', 'utf8'), ctx, { filename: 'Code.gs' });
  ctx.CONFIG.PROJECT_ID = 'demo-bluvia';
  return { ctx, spreadsheet, props };
}

// ---------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------
const get = async (p, id) => ({ id, ...(await getDoc(doc(db, p, id))).data() });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const objects = (sheet) => {
  const header = sheet.data[0] || [];
  return sheet.data.slice(1).map((row) => Object.fromEntries(header.map((h, i) => [h, row[i] === undefined ? '' : row[i]])));
};

describe('Code.gs against the Firestore emulator', () => {
  let S; let jar20; let jar10; let partyId; let billId; let receiptId; let jarRetId;
  let logSheet;

  beforeAll(async () => {
    // start from an empty database (the other emulator test file may have run before this one)
    await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-bluvia/databases/(default)/documents', { method: 'DELETE' });
    const rules = readFileSync('firestore.rules', 'utf8').replaceAll('OWNER_UID', OWNER);
    const res = await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-bluvia:securityRules', {
      method: 'PUT', body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: rules }] } }),
    });
    expect(res.ok).toBe(true);
    await api.seedDefaults();
    const jars = (await getDocs(collection(db, 'jarTypes'))).docs.map((d) => ({ id: d.id, ...d.data() }));
    jar20 = jars.find((j) => j.name === '20L Jar').id;
    jar10 = jars.find((j) => j.name === '10L Jar').id;
    S = loadScript();

    partyId = await api.createParty({
      name: 'Ram Traders', phone: '9999999999', address: '12 Main Road', notes: '', active: true,
      openingBalance: 100000, openingJars: { [jar20]: 2 }, openingDeposit: 50000, jarRates: {}, itemRates: {},
    });
  });

  it('1. first sync logs one row per transaction with correct values', async () => {
    const b = await api.createBill({
      type: 'bill', partyId, partyName: 'Ram Traders', dateKey: '2026-02-01', forText: 'Drinking water supply.',
      lines: [{ itemId: 'i1', itemName: '20L Jar Water', jarTypeId: jar20, qty: 5, rate: 4000, amount: 20000, jarGiven: true }],
      subTotal: 20000, discount: 0, extraCharge: 0, total: 20000, note: '',
      depositAmount: 100000, depositJarTypeId: jar20, returns: { [jar20]: 2 },
    });
    billId = b.id;
    const rec = await api.createEntry({ type: 'receipt', partyId, partyName: 'Ram Traders', dateKey: '2026-02-02', amount: 30000, mode: 'Cash', reference: '', note: 'first payment' });
    receiptId = rec.id;
    const jr = await api.createEntry({ type: 'jarReturn', partyId, partyName: 'Ram Traders', dateKey: '2026-02-02', jarTypeId: jar20, qty: 3, note: '' });
    jarRetId = jr.id;
    await api.createEntry({ type: 'depositRefund', partyId, partyName: 'Ram Traders', dateKey: '2026-02-03', jarTypeId: null, amount: 20000, jarQty: 0, note: '' });
    await api.createEntry({ type: 'depositAdjust', partyId, partyName: 'Ram Traders', dateKey: '2026-02-03', jarTypeId: null, amount: 10000, jarQty: 0, note: '' });
    await api.createEntry({ type: 'adjustment', partyId, partyName: 'Ram Traders', dateKey: '2026-02-03', amount: -5000, note: 'round off' });

    S.ctx.syncLog();
    logSheet = S.spreadsheet.getSheetByName('Log');
    const header = logSheet.data[0];
    expect(header.slice(0, 5)).toEqual(['Synced at', 'Event', 'Txn ID', 'Updated at', 'Date']);
    expect(header).toContain('Given: 20L Jar');
    expect(header).toContain('Returned: 20L Jar');
    expect(header).toContain('Given: 10L Jar');

    const rows = objects(logSheet);
    // bill + linked deposit + linked return + receipt + jar return + refund + adjust + adjustment
    expect(rows).toHaveLength(8);
    expect(new Set(rows.map((r) => r['Txn ID'])).size).toBe(8);
    expect(rows.every((r) => r.Event === 'Created')).toBe(true);
    expect(rows.every((r) => r.Party === 'Ram Traders' && r['Party ID'] === partyId)).toBe(true);

    const bill = rows.find((r) => r.Type === 'Bill');
    expect(bill['Bill no']).toBe('00001');
    expect(bill['Billed (Rs)']).toBe(200);
    expect(bill['Given: 20L Jar']).toBe(5);
    expect(bill['Returned: 20L Jar']).toBe(''); // bill's own returnedInBill is logged as its own jar return row
    expect(bill['Given: 10L Jar']).toBe('');
    expect(bill.Date.getTime()).toBe(new Date(2026, 1, 1, 12).getTime()); // noon, so a timezone offset never moves it to another day
    expect(bill.Deleted).toBe('');

    const taken = rows.find((r) => r.Type === 'Deposit taken');
    expect(taken['Deposit change (Rs)']).toBe(1000);
    expect(taken['Billed (Rs)']).toBe('');
    expect(taken.Note).toContain(bill['Bill no']);
    expect(rows.find((r) => r.Type === 'Deposit refund')['Deposit change (Rs)']).toBe(-200);
    expect(rows.find((r) => r.Type === 'Deposit adjusted')['Deposit change (Rs)']).toBe(-100);

    const receipt = rows.find((r) => r.Type === 'Receipt');
    expect(receipt['Received (Rs)']).toBe(300);
    expect(receipt.Mode).toBe('Cash');
    expect(receipt.Note).toBe('first payment');

    const returns = rows.filter((r) => r.Type === 'Jar return');
    expect(returns.map((r) => r['Returned: 20L Jar']).sort()).toEqual([2, 3]);
    expect(rows.find((r) => r.Type === 'Adjustment')['Adjustment (Rs)']).toBe(-50);
  });

  it('2. a second sync adds nothing', () => {
    const before = logSheet.data.length;
    S.ctx.syncLog();
    expect(logSheet.data.length).toBe(before);
    const status = Object.fromEntries(S.spreadsheet.getSheetByName('Status').data.slice(1));
    expect(status['Last result']).toBe('OK');
    expect(status['Rows added in last run']).toBe(0);
    expect(status['Total log rows']).toBe(8);
  });

  it('3. edit, delete and restore each add exactly one new row', async () => {
    await sleep(2300); // Event "Created" is decided by updatedAt vs createdAt within 2 s, so let that window pass
    const rec = await get('transactions', receiptId);
    await api.updateTxn(rec, { amount: 50000 });
    const jr = await get('transactions', jarRetId);
    await api.softDeleteTxn(jr);
    const before = logSheet.data.length;
    S.ctx.syncLog();
    const added = objects(logSheet).slice(before - 1);
    expect(added).toHaveLength(2);
    const upd = added.find((r) => r['Txn ID'] === receiptId);
    expect(upd.Event).toBe('Updated');
    expect(upd['Received (Rs)']).toBe(500);
    const del = added.find((r) => r['Txn ID'] === jarRetId);
    expect(del.Event).toBe('Deleted');
    expect(del.Deleted).toBe('YES');

    await sleep(50);
    await api.restoreTxn(await get('transactions', jarRetId));
    const before2 = logSheet.data.length;
    S.ctx.syncLog();
    const added2 = objects(logSheet).slice(before2 - 1);
    expect(added2).toHaveLength(1);
    expect(added2[0]['Txn ID']).toBe(jarRetId);
    expect(added2[0].Event).toBe('Updated');
    expect(added2[0].Deleted).toBe('');
  });

  it('4. paging with ties (BATCH=2): every transaction logged, none twice, across several runs', async () => {
    S.ctx.CONFIG.BATCH = 2;
    // two bills that each write 3 documents (bill + deposit + jar return) with the SAME server timestamp, plus one receipt
    for (const day of ['2026-02-04', '2026-02-05']) {
      await api.createBill({
        type: 'bill', partyId, partyName: 'Ram Traders', dateKey: day, forText: '',
        lines: [{ itemId: 'i2', itemName: '10L Jar Water', jarTypeId: jar10, qty: 2, rate: 2500, amount: 5000, jarGiven: true }],
        subTotal: 5000, discount: 0, extraCharge: 0, total: 5000, note: '',
        depositAmount: 20000, depositJarTypeId: jar10, returns: { [jar10]: 1 },
      });
    }
    await api.createEntry({ type: 'receipt', partyId, partyName: 'Ram Traders', dateKey: '2026-02-05', amount: 7000, mode: 'UPI', reference: 'UPI123', note: '' });

    S.ctx.syncLog();
    S.ctx.syncLog();
    S.ctx.syncLog();
    S.ctx.CONFIG.BATCH = 300;

    const rows = objects(logSheet);
    const versions = rows.map((r) => `${r['Txn ID']}|${new Date(r['Updated at']).getTime()}`);
    expect(new Set(versions).size).toBe(versions.length); // never logged twice

    const all = (await getDocs(collection(db, 'transactions'))).docs;
    expect(all).toHaveLength(8 + 6 + 1);
    for (const d of all) {
      const ms = d.data().updatedAt.toMillis();
      expect(versions).toContain(`${d.id}|${ms}`); // every current version is in the log
    }
    const ups = rows.filter((r) => r.Mode === 'UPI');
    expect(ups).toHaveLength(1);
    expect(ups[0].Reference).toBe('UPI123');
    expect(rows.filter((r) => r['Given: 10L Jar'] === 2)).toHaveLength(2);
  });

  it('5. refreshParties writes balances, daily sales and collection, and the status totals', async () => {
    S.ctx.refreshParties();
    const parties = objects(S.spreadsheet.getSheetByName('Parties'));
    const p = await get('parties', partyId);
    expect(parties).toHaveLength(1);
    const row = parties[0];
    expect(row.Party).toBe('Ram Traders');
    expect(row.Phone).toBe('9999999999');
    expect(row['Outstanding (Rs)']).toBe(p.outstanding / 100);
    expect(row['Deposit held (Rs)']).toBe(p.depositBalance / 100);
    expect(row['Jars: 20L Jar']).toBe(p.jarBalance[jar20] || 0);
    expect(row['Jars: 10L Jar']).toBe(p.jarBalance[jar10] || 0);
    expect(row['Opening balance (Rs)']).toBe(1000);
    expect(row['Party ID']).toBe(partyId);
    expect(row['Jars with party']).toContain('20L Jar');

    const daily = objects(S.spreadsheet.getSheetByName('Daily'));
    const stats = (await getDocs(collection(db, 'stats'))).docs.filter((d) => d.id.startsWith('daily_'));
    expect(daily).toHaveLength(stats.length);
    for (const d of stats) {
      const key = d.id.slice(6);
      const [y, m, dd] = key.split('-').map(Number);
      const r = daily.find((x) => x.Date.getTime() === new Date(y, m - 1, dd, 12).getTime());
      expect(r, `daily row for ${key}`).toBeTruthy();
      expect(r['Sales (Rs)']).toBe(d.data().sales / 100);
      expect(r['Collection (Rs)']).toBe(d.data().collection / 100);
      expect(r.Bills).toBe(d.data().billsCount);
    }
    // newest day first
    expect(daily[0].Date.getTime()).toBeGreaterThan(daily[daily.length - 1].Date.getTime());

    const summary = (await getDoc(doc(db, 'stats', 'summary'))).data();
    const status = Object.fromEntries(S.spreadsheet.getSheetByName('Status').data.slice(1));
    expect(status['Total outstanding (Rs)']).toBe(summary.totalOutstanding / 100);
    expect(status['Total deposit held (Rs)']).toBe(summary.totalDepositHeld / 100);
    expect(status['Last result']).toBe('OK'); // refreshParties must keep the sync status rows
    expect(status['Parties refreshed']).toBeTruthy();
  });

  it('6. log row count equals the number of distinct (txnId, updatedAt) versions', async () => {
    const rows = objects(logSheet);
    const versions = new Set(rows.map((r) => `${r['Txn ID']}|${new Date(r['Updated at']).getTime()}`));
    expect(rows).toHaveLength(versions.size);
    // history: receipt created + edited, jar return created + deleted + restored, everything else once
    const perId = {};
    rows.forEach((r) => { perId[r['Txn ID']] = (perId[r['Txn ID']] || 0) + 1; });
    expect(perId[receiptId]).toBe(2);
    expect(perId[jarRetId]).toBe(3);
    expect(perId[billId]).toBe(1);
    expect(rows).toHaveLength(8 + 1 + 2 + 7); // 8 first, +1 edit, +2 delete/restore, +7 paging test
    const status = Object.fromEntries(S.spreadsheet.getSheetByName('Status').data.slice(1));
    expect(status['Total log rows']).toBe(rows.length);
  });
});
