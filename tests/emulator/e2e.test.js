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
const { initializeApp } = await import('firebase/app');
const { doc, getDoc, setDoc, getDocs, collection, getFirestore, connectFirestoreEmulator } = await import('firebase/firestore');

const get = async (p, id) => (await getDoc(doc(db, p, id))).data();

describe('Bluvia against Firestore emulator', () => {
  let jar20; let partyId; let billId; let billNo; let recId;

  beforeAll(async () => {
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
    expect(billNo).toBe('BLV-1');
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
