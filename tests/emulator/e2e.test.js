// End-to-end test against the Firebase EMULATORS (real Firestore rules + real batches/transactions).
// Run with:  npm run test:emulator
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const OWNER = 'test-owner-uid';
vi.mock('../../src/lib/firebase.js', async () => {
  const { initializeApp } = await import('firebase/app');
  const { getFirestore, connectFirestoreEmulator } = await import('firebase/firestore');
  const app = initializeApp({ projectId: 'demo-bluvia', apiKey: 'fake', appId: 'fake' });
  const db = getFirestore(app);
  // mockUserToken = signed-in user with this uid (what request.auth.uid sees in the rules)
  connectFirestoreEmulator(db, '127.0.0.1', 8080, { mockUserToken: { sub: 'test-owner-uid' } });
  return { db, auth: null, app, configured: true };
});

const api = await import('../../src/data/api.js');
const { db } = await import('../../src/lib/firebase.js');
const { computeRecalc } = await import('../../src/lib/recalcDb.js');
const backupLib = await import('../../src/lib/backup.js');
const { initializeApp } = await import('firebase/app');
const { doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, collection, getFirestore, connectFirestoreEmulator } = await import('firebase/firestore');

const get = async (p, id) => (await getDoc(doc(db, p, id))).data();

describe('Bluvia against Firestore emulator', () => {
  let jar20; let partyId; let billId; let billNo; let recId;

  beforeAll(async () => {
    // start from an empty database (the other emulator test file may have run before this one)
    await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-bluvia/databases/(default)/documents', { method: 'DELETE' });
    const rules = readFileSync('firestore.rules', 'utf8').replaceAll('OWNER_UID', OWNER);
    const res = await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-bluvia:securityRules', {
      method: 'PUT', body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: rules }] } }),
    });
    expect(res.ok).toBe(true);
  });

  it('seeds defaults and creates a party with opening balances (stats updated)', async () => {
    await api.seedDefaults();
    const s = await get('settings', 'main');
    expect(s.nextBillNo).toBe(1);
    const jars = (await getDocs(collection(db, 'jarTypes'))).docs.map((d) => ({ id: d.id, ...d.data() }));
    jar20 = jars.find((j) => j.name === '20L Jar').id;
    partyId = await api.createParty({
      name: 'Ram Traders', phone: '9999999999', address: '', notes: '', active: true,
      openingBalance: 100000, openingJars: { [jar20]: 2 }, openingDeposit: 50000, jarRates: {}, itemRates: {},
    });
    const p = await get('parties', partyId);
    expect(p.outstanding).toBe(100000);
    expect(p.jarBalance[jar20]).toBe(2);
    expect(p.depositBalance).toBe(50000);
    const sum = await get('stats', 'summary');
    expect(sum.totalOutstanding).toBe(100000);
    expect(sum.totalJarsOut[jar20]).toBe(2);
    expect(sum.totalDepositHeld).toBe(50000);
  });

  it('bill: number from settings, balances, deposit entry, stats', async () => {
    const r = await api.createBill({
      type: 'bill', partyId, partyName: 'Ram Traders', dateKey: '2026-02-01',
      lines: [{ itemId: 'i1', itemName: '20L Jar Water', jarTypeId: jar20, qty: 5, rate: 4000, amount: 20000, jarGiven: true }],
      subTotal: 20000, discount: 0, extraCharge: 0, total: 20000, note: '', depositAmount: 100000, depositJarTypeId: jar20,
    });
    billId = r.id; billNo = r.billNo;
    expect(billNo).toBe('00001');
    expect(r.prevOutstanding).toBe(100000);
    expect((await get('settings', 'main')).nextBillNo).toBe(2);
    const p = await get('parties', partyId);
    expect(p.outstanding).toBe(120000);
    expect(p.jarBalance[jar20]).toBe(7);
    expect(p.depositBalance).toBe(150000);
    const day = await get('stats', 'daily_2026-02-01');
    expect(day).toMatchObject({ sales: 20000, collection: 0, billsCount: 1 }); // deposit not in sales
  });

  it('receipt, jar return, edit bill, delete + restore keep everything consistent', async () => {
    const rec = await api.createEntry({ type: 'receipt', partyId, partyName: 'Ram Traders', dateKey: '2026-02-02', amount: 30000, mode: 'Cash', reference: '', note: '' });
    recId = rec.id;
    await api.createEntry({ type: 'jarReturn', partyId, partyName: 'Ram Traders', dateKey: '2026-02-02', jarTypeId: jar20, qty: 3, note: '' });
    let p = await get('parties', partyId);
    expect(p.outstanding).toBe(90000);
    expect(p.jarBalance[jar20]).toBe(4);

    const bill = { id: billId, ...(await get('transactions', billId)) };
    await api.updateTxn(bill, { lines: [{ ...bill.lines[0], qty: 8, rate: 4500, amount: 36000 }], subTotal: 36000, total: 36000 });
    p = await get('parties', partyId);
    expect(p.outstanding).toBe(106000);
    expect(p.jarBalance[jar20]).toBe(7);
    expect((await get('stats', 'daily_2026-02-01')).sales).toBe(36000);
    expect((await get('transactions', billId)).newOutstanding).toBe(136000);

    const rcpt = { id: recId, ...(await get('transactions', recId)) };
    await api.softDeleteTxn(rcpt);
    expect((await get('parties', partyId)).outstanding).toBe(136000);
    expect((await get('stats', 'daily_2026-02-02')).collection).toBe(0);
    await api.restoreTxn({ ...rcpt, deleted: true });
    expect((await get('parties', partyId)).outstanding).toBe(106000);
  });

  it('deposit refund / adjust', async () => {
    await api.createEntry({ type: 'depositRefund', partyId, partyName: 'x', dateKey: '2026-02-03', jarTypeId: null, amount: 20000, jarQty: 0, note: '' });
    await api.createEntry({ type: 'depositAdjust', partyId, partyName: 'x', dateKey: '2026-02-03', jarTypeId: null, amount: 10000, jarQty: 0, note: '' });
    const p = await get('parties', partyId);
    expect(p.depositBalance).toBe(120000);
    expect(p.outstanding).toBe(96000);
  });

  it('paginated ledger returns newest first, 30 per page', async () => {
    const r = await api.listTxns({ partyId, pageSize: 2 });
    expect(r.items).toHaveLength(2);
    expect(r.hasMore).toBe(true);
    const r2 = await api.listTxns({ partyId, pageSize: 2, after: r.last });
    expect(r2.items.length).toBeGreaterThan(0);
    const del = await api.listTxns({ deleted: true });
    expect(del.items).toHaveLength(0);
  });

  it('recalculate-from-entries finds NO difference after all those edits', async () => {
    const res = await computeRecalc();
    expect(res.diffs).toEqual([]);
  });

  it('edit party opening values moves balances by the difference only', async () => {
    const old = { id: partyId, ...(await get('parties', partyId)) };
    await api.updateParty(partyId, old, { ...old, openingBalance: 150000, openingJars: {}, openingDeposit: 50000 });
    const p = await get('parties', partyId);
    expect(p.outstanding).toBe(146000);
    expect(p.jarBalance[jar20]).toBe(5);
    expect((await computeRecalc()).diffs).toEqual([]);
  });

  it('bill with returned jars: padded number, separate jarReturn entry, balances match recalculation', async () => {
    const before = await get('parties', partyId);
    const r = await api.createBill({
      type: 'bill', partyId, partyName: 'Ram Traders', dateKey: '2026-02-05', forText: 'Drinking water supply.',
      lines: [{ itemId: 'i1', itemName: '20L Jar Water', jarTypeId: jar20, qty: 4, rate: 4000, amount: 16000, jarGiven: true }],
      subTotal: 16000, discount: 0, extraCharge: 0, total: 16000, note: '', returns: { [jar20]: 3 },
    });
    expect(r.billNo).toBe('00002');
    const p = await get('parties', partyId);
    expect(p.outstanding).toBe(before.outstanding + 16000);
    expect(p.jarBalance[jar20]).toBe(before.jarBalance[jar20] + 4 - 3);
    const bill = await get('transactions', r.id);
    expect(bill.returnedInBill).toEqual({ [jar20]: 3 });
    expect(bill.forText).toBe('Drinking water supply.');
    expect((await computeRecalc()).diffs).toEqual([]);
  });

  it('rules hardening: money must be whole, bounded, valid; deletes and cross-group type flips are denied', async () => {
    const denied = (p) => expect(p).rejects.toThrow(/permission|false for/i);
    const good = { type: 'receipt', partyId, dateKey: '2026-02-10', deleted: false, amount: 1000, mode: 'Cash', note: '' };
    // positive control: a valid entry is accepted
    await setDoc(doc(db, 'transactions', 'rule-ok'), good);

    for (const bad of [NaN, Infinity, -Infinity, 10.5, -1, 1e12, 1e15, '100']) {
      await denied(setDoc(doc(db, 'transactions', 'rule-bad'), { ...good, amount: bad }));
    }
    await denied(setDoc(doc(db, 'transactions', 'rule-bad'), { ...good, dateKey: '2026-2-1' }));
    await denied(setDoc(doc(db, 'transactions', 'rule-bad'), { ...good, dateKey: '' }));
    await denied(setDoc(doc(db, 'transactions', 'rule-bad'), { ...good, deleted: 'false' }));
    await denied(setDoc(doc(db, 'transactions', 'rule-bad'), { ...good, partyId: '' }));
    await denied(setDoc(doc(db, 'transactions', 'rule-bad'), { ...good, note: 'x'.repeat(2000) }));
    await denied(setDoc(doc(db, 'transactions', 'rule-bad'), { type: 'bill', partyId, dateKey: '2026-02-10', deleted: false, total: 12.5, lines: [] }));
    await denied(setDoc(doc(db, 'transactions', 'rule-bad'), { type: 'jarReturn', partyId, dateKey: '2026-02-10', deleted: false, qty: 2.5, jarTypeId: jar20 }));
    await denied(setDoc(doc(db, 'transactions', 'rule-bad'), { type: 'jarReturn', partyId, dateKey: '2026-02-10', deleted: false, qty: -1, jarTypeId: jar20 }));

    // other collections
    await denied(setDoc(doc(db, 'stats', 'summary'), { totalOutstanding: NaN }, { merge: true }));
    await denied(setDoc(doc(db, 'settings', 'main'), { nextBillNo: 0 }, { merge: true }));
    await denied(setDoc(doc(db, 'settings', 'main'), { nextBillNo: 5.5 }, { merge: true }));
    await denied(setDoc(doc(db, 'settings', 'main'), { billNoPad: -1 }, { merge: true }));
    await denied(setDoc(doc(db, 'parties', 'rule-bad-party'), { name: 'x', openingBalance: 1.5 }));
    await denied(setDoc(doc(db, 'jarTypes', 'rule-bad-jar'), { name: 'x', defaultRate: -5 }));

    // type may change inside its group (jarReturn <-> jarGiven) but never across groups (receipt -> deposit)
    await setDoc(doc(db, 'transactions', 'rule-jar'), { type: 'jarReturn', partyId, dateKey: '2026-02-10', deleted: false, qty: 1, jarTypeId: jar20 });
    await updateDoc(doc(db, 'transactions', 'rule-jar'), { type: 'jarGiven' });
    await denied(updateDoc(doc(db, 'transactions', 'rule-ok'), { type: 'depositTaken' }));
    await denied(updateDoc(doc(db, 'transactions', 'rule-ok'), { type: 'bill', total: 500 }));

    // hard delete is denied for everything, even for the owner
    await denied(deleteDoc(doc(db, 'transactions', 'rule-ok')));
    await denied(deleteDoc(doc(db, 'parties', partyId)));
    await denied(deleteDoc(doc(db, 'settings', 'main')));
    await denied(deleteDoc(doc(db, 'stats', 'summary')));
    await denied(deleteDoc(doc(db, 'jarTypes', jar20)));

    // the entries used by this test are tidy afterwards: soft-delete is the supported way (no balance impact: we never touched parties)
    await updateDoc(doc(db, 'transactions', 'rule-ok'), { deleted: true });
    await updateDoc(doc(db, 'transactions', 'rule-jar'), { deleted: true });
  });

  it('backup restore: validates the file, never lowers nextBillNo, deactivates stale jar types, names a failing chunk', async () => {
    const { validateBackup, exportAll, restoreAll, previewRestore } = backupLib;
    // 1) clear Hinglish errors instead of "Cannot read properties"
    expect(() => validateBackup(null)).toThrow(/Bluvia ka backup/);
    expect(() => validateBackup({ app: 'bluvia', data: { parties: 'x' } })).toThrow(/list nahi/);
    expect(() => validateBackup({ app: 'bluvia', data: { parties: [{ name: 'no id' }] } })).toThrow(/sahi id nahi/);
    expect(() => validateBackup({ app: 'bluvia', data: { secrets: [] } })).toThrow(/anjaan section/);
    expect(() => validateBackup({ app: 'bluvia', data: [] })).toThrow(/Bluvia ka backup/);

    // 2) real round trip
    const backup = await exportAll();
    const total = Object.values(backup.data).reduce((a, r) => a + r.length, 0);
    const preview = await previewRestore(backup);
    expect(preview.jarTypes.isNew).toBe(0);                // every jar type in the file already exists
    expect(preview.settings.overwrite).toBe(1);

    const settingsNow = await get('settings', 'main');
    await setDoc(doc(db, 'settings', 'main'), { nextBillNo: settingsNow.nextBillNo + 10 }, { merge: true }); // bills issued after the backup
    await setDoc(doc(db, 'jarTypes', 'fresh-default'), { name: 'Fresh default', defaultRate: 100, defaultDeposit: 0, active: true });

    const res = await restoreAll(backup);
    expect(res.restored).toBe(total);
    expect(res.deactivated).toBe(1);
    expect((await get('settings', 'main')).nextBillNo).toBe(settingsNow.nextBillNo + 10); // not rolled back
    expect((await get('jarTypes', 'fresh-default')).active).toBe(false);
    expect((await get('jarTypes', jar20)).active).not.toBe(false);
    expect((await computeRecalc()).diffs).toEqual([]);

    // a higher counter inside the backup still wins
    const higher = JSON.parse(JSON.stringify(backup));
    higher.data.settings.find((r) => r.id === 'main').nextBillNo = settingsNow.nextBillNo + 50;
    await restoreAll(higher);
    expect((await get('settings', 'main')).nextBillNo).toBe(settingsNow.nextBillNo + 50);

    // 3) a chunk the rules reject is reported by number, not silently half-applied
    const broken = JSON.parse(JSON.stringify(backup));
    broken.data.transactions.push({ id: 'broken-txn', type: 'receipt', partyId, dateKey: 'bad-date', deleted: false, amount: 5 });
    await expect(restoreAll(broken)).rejects.toThrow(/hissa \d+\/\d+ fail hua/);
  });

  it('rules: party area must be a short string; settings areas must be a list', async () => {
    await setDoc(doc(db, 'parties', partyId), { area: 'Sai Nagar' }, { merge: true });
    expect((await get('parties', partyId)).area).toBe('Sai Nagar');
    await expect(setDoc(doc(db, 'parties', partyId), { area: 5 }, { merge: true })).rejects.toThrow(/permission|false for/i);
    await expect(setDoc(doc(db, 'parties', partyId), { area: 'x'.repeat(61) }, { merge: true })).rejects.toThrow(/permission|false for/i);
    await setDoc(doc(db, 'settings', 'main'), { areas: ['Market', 'Sai Nagar'] }, { merge: true });
    expect((await get('settings', 'main')).areas).toEqual(['Market', 'Sai Nagar']);
    await expect(setDoc(doc(db, 'settings', 'main'), { areas: 'Market' }, { merge: true })).rejects.toThrow(/permission|false for/i);
    await setDoc(doc(db, 'parties', partyId), { area: '' }, { merge: true }); // no area is allowed
  });

  it('rules: party location must be valid numbers', async () => {
    await setDoc(doc(db, 'parties', partyId), { lat: 21.2514, lng: 81.6296, locAccuracy: 18, locSource: 'gps' }, { merge: true });
    expect((await get('parties', partyId)).lat).toBe(21.2514);
    await expect(setDoc(doc(db, 'parties', partyId), { lat: 91 }, { merge: true })).rejects.toThrow(/permission|false for/i);
    await expect(setDoc(doc(db, 'parties', partyId), { lng: -181 }, { merge: true })).rejects.toThrow(/permission|false for/i);
    await expect(setDoc(doc(db, 'parties', partyId), { lat: '21.2' }, { merge: true })).rejects.toThrow(/permission|false for/i);
    await expect(setDoc(doc(db, 'parties', partyId), { locAccuracy: -5 }, { merge: true })).rejects.toThrow(/permission|false for/i);
    await setDoc(doc(db, 'parties', partyId), { locAccuracy: null }, { merge: true }); // unknown accuracy is allowed
  });

  it('rules: UPI settings are short strings and the QR mode is bill or due', async () => {
    await setDoc(doc(db, 'settings', 'main'), { upiId: 'shop@okaxis', upiName: 'Bluvia', upiRemark: 'Bill {billNo}', upiQrAmount: 'due' }, { merge: true });
    expect((await get('settings', 'main')).upiId).toBe('shop@okaxis');
    await expect(setDoc(doc(db, 'settings', 'main'), { upiQrAmount: 'everything' }, { merge: true })).rejects.toThrow(/permission|false for/i);
    await expect(setDoc(doc(db, 'settings', 'main'), { upiId: 'x'.repeat(101) }, { merge: true })).rejects.toThrow(/permission|false for/i);
    await expect(setDoc(doc(db, 'settings', 'main'), { upiName: 5 }, { merge: true })).rejects.toThrow(/permission|false for/i);
    await setDoc(doc(db, 'settings', 'main'), { upiQrAmount: 'bill' }, { merge: true });
  });

  it('rules: bad data and signed-out access are rejected', async () => {
    await expect(setDoc(doc(db, 'transactions', 'bad'), { type: 'receipt', partyId, dateKey: '2026-01-01', amount: 'abc' })).rejects.toThrow(/permission|false for/i);
    await expect(setDoc(doc(db, 'secret', 'x'), { a: 1 })).rejects.toThrow(/permission|false for/i);
    // a client that is NOT the owner (different uid) and one that is signed out
    const other = getFirestore(initializeApp({ projectId: 'demo-bluvia', apiKey: 'fake', appId: 'fake' }, 'other'));
    connectFirestoreEmulator(other, '127.0.0.1', 8080, { mockUserToken: { sub: 'someone-else' } });
    await expect(getDoc(doc(other, 'settings', 'main'))).rejects.toThrow(/permission|false for/i);
    const anon = getFirestore(initializeApp({ projectId: 'demo-bluvia', apiKey: 'fake', appId: 'fake' }, 'anon'));
    connectFirestoreEmulator(anon, '127.0.0.1', 8080);
    await expect(getDoc(doc(anon, 'settings', 'main'))).rejects.toThrow(/permission|false for/i);
  });
});
