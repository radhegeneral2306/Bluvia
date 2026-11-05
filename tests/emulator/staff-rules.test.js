// Staff / owner permissions against the REAL firestore.rules on the Firestore emulator.
// Part 1: raw SDK writes (one firestore instance per identity) that mimic exactly what src/data/api.js writes.
// Part 2: the real api.js functions, run as owner and as staff (the mocked db is switched per run with vi.resetModules).
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const PORT = Number(process.env.FS_EMULATOR_PORT || 8080);
const PROJECT = process.env.FS_EMULATOR_PROJECT || process.env.GCLOUD_PROJECT || 'demo-bluvia-g';
const OWNER = 'test-owner-uid';
const S1 = 'staff-one-uid';
const S2 = 'staff-two-uid';
const BLOCKED = 'blocked-staff-uid';
const STRANGER = 'stranger-uid';

const { initializeApp } = await import('firebase/app');
const fs = await import('firebase/firestore');
const {
  getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, runTransaction,
  increment, serverTimestamp, Timestamp, collection,
} = fs;

let appCount = 0;
function dbFor(uid) {
  const app = initializeApp({ projectId: PROJECT, apiKey: 'fake', appId: 'fake' }, `g-${uid}-${appCount++}`);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', PORT, { mockUserToken: { sub: uid } });
  return db;
}

// api.js reads db from ../lib/firebase.js; globalThis.__IDENT says which identity this module instance uses
vi.mock('../../src/lib/firebase.js', async () => {
  const { initializeApp: init } = await import('firebase/app');
  const { getFirestore: gf, connectFirestoreEmulator: cfe } = await import('firebase/firestore');
  const port = Number(process.env.FS_EMULATOR_PORT || 8080);
  const project = process.env.FS_EMULATOR_PROJECT || process.env.GCLOUD_PROJECT || 'demo-bluvia-g';
  const uid = globalThis.__IDENT;
  const app = init({ projectId: project, apiKey: 'fake', appId: 'fake' }, `api-${uid}-${Math.random()}`);
  const db = gf(app);
  cfe(db, '127.0.0.1', port, { mockUserToken: { sub: uid } });
  return { db, auth: null, app, configured: true };
});
async function loadApi(uid) {
  globalThis.__IDENT = uid;
  vi.resetModules();
  return import('../../src/data/api.js');
}

const owner = dbFor(OWNER);
const s1 = dbFor(S1);
const s2 = dbFor(S2);
const blocked = dbFor(BLOCKED);
const stranger = dbFor(STRANGER);

const denied = async (p) => {
  let err = null;
  try { await p; } catch (e) { err = e; }
  expect(err, 'expected permission-denied but the write/read succeeded').not.toBeNull();
  expect(err.code).toBe('permission-denied');
};
const allowed = async (p) => { await p; };

const me = (uid, name) => ({ uid, name });
const P = 'party1';
const J = 'jar20';
const DAY = '2026-03-01';
const hoursAgo = (h) => Timestamp.fromMillis(Date.now() - h * 3600 * 1000);

const billDoc = (uid, extra = {}) => ({
  type: 'bill', partyId: P, partyName: 'Ram', dateKey: DAY, date: Timestamp.now(), total: 20000, subTotal: 20000,
  deleted: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: me(uid, 'N'), ...extra,
});
let idc = 0;
const newId = (p) => `${p}_${++idc}`;
/** owner-seeded txn (any shape, createdAt can be in the past) */
async function seedTxn(id, data) { await setDoc(doc(owner, 'transactions', id), data); return id; }
const auditData = (txnId, uid, action = 'edit', over = {}) => ({
  txnId, action, at: serverTimestamp(), by: me(uid, 'N'), partyId: P, type: 'bill', before: {}, after: {}, ctx: {}, ...over,
});
/** the batch api.updateTxn builds: txn update + audit record */
function editBatch(db, uid, id, patch, { seq = 1, auditId = `${id}_${seq}`, audit = true, action = 'edit' } = {}) {
  const b = writeBatch(db);
  b.update(doc(db, 'transactions', id), { ...patch, updatedAt: serverTimestamp(), auditSeq: seq });
  if (audit) b.set(doc(db, 'audit', auditId), auditData(id, uid, action));
  return b.commit();
}

beforeAll(async () => {
  const base = `http://127.0.0.1:${PORT}/emulator/v1/projects/${PROJECT}`;
  await fetch(`${base}/databases/(default)/documents`, { method: 'DELETE' });
  const rules = readFileSync('firestore.rules', 'utf8').replaceAll('OWNER_UID', OWNER);
  const res = await fetch(`${base}:securityRules`, { method: 'PUT', body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: rules }] } }) });
  expect(res.ok).toBe(true);
  // seed through the owner (the rules allow it)
  await setDoc(doc(owner, 'users', OWNER), { name: 'Owner', role: 'admin', active: true });
  await setDoc(doc(owner, 'users', S1), { name: 'Staff One', role: 'staff', active: true });
  await setDoc(doc(owner, 'users', S2), { name: 'Staff Two', role: 'staff', active: true });
  await setDoc(doc(owner, 'users', BLOCKED), { name: 'Blocked', role: 'staff', active: false });
  await setDoc(doc(owner, 'settings', 'main'), { businessName: 'Bluvia', billPrefix: '', billNoPad: 5, nextBillNo: 10, currency: 'INR' });
  await setDoc(doc(owner, 'jarTypes', J), { name: '20L Jar', defaultRate: 4000, defaultDeposit: 10000 });
  await setDoc(doc(owner, 'items', 'item1'), { name: 'Water', defaultRate: 4000 });
  await setDoc(doc(owner, 'parties', P), { name: 'Ram', outstanding: 0, depositBalance: 0, openingBalance: 0, openingDeposit: 0, jarBalance: {} });
  await setDoc(doc(owner, 'parties', 'party2'), { name: 'Shyam', outstanding: 0, depositBalance: 0, openingBalance: 0, openingDeposit: 0, jarBalance: {} });
  await setDoc(doc(owner, 'stats', 'summary'), { totalOutstanding: 0, totalDepositHeld: 0 });
  await setDoc(doc(owner, 'audit', 'seed_1'), auditData('seed', OWNER));
  await seedTxn('seedtxn', { type: 'bill', partyId: P, dateKey: DAY, deleted: false, total: 100, createdAt: serverTimestamp() });
});

describe('reads', () => {
  it('stranger (no users doc) is denied everything', async () => {
    for (const [c, id] of [['settings', 'main'], ['parties', P], ['jarTypes', J], ['items', 'item1'], ['transactions', 'seedtxn'], ['stats', 'summary'], ['users', S1], ['audit', 'seed_1']]) {
      await denied(getDoc(doc(stranger, c, id)));
    }
    await denied(setDoc(doc(stranger, 'transactions', newId('x')), billDoc(STRANGER)));
    await denied(updateDoc(doc(stranger, 'settings', 'main'), { nextBillNo: 11 }));
  });
  it('blocked staff (active false) is denied read and write', async () => {
    for (const [c, id] of [['settings', 'main'], ['parties', P], ['transactions', 'seedtxn'], ['stats', 'summary'], ['jarTypes', J], ['items', 'item1']]) {
      await denied(getDoc(doc(blocked, c, id)));
    }
    await denied(setDoc(doc(blocked, 'transactions', newId('b')), billDoc(BLOCKED)));
    await denied(setDoc(doc(blocked, 'parties', P), { outstanding: increment(1), lastTxnAt: serverTimestamp() }, { merge: true }));
    await denied(setDoc(doc(blocked, 'stats', 'summary'), { totalOutstanding: increment(1) }, { merge: true }));
    await denied(updateDoc(doc(blocked, 'users', BLOCKED), { lang: 'hi' }));
  });
  it('active staff can read settings, parties, masters, transactions, stats', async () => {
    for (const [c, id] of [['settings', 'main'], ['parties', P], ['jarTypes', J], ['items', 'item1'], ['transactions', 'seedtxn'], ['stats', 'summary']]) {
      expect((await getDoc(doc(s1, c, id))).exists()).toBe(true);
    }
  });
  it('staff cannot read audit or other users docs, can read own', async () => {
    await denied(getDoc(doc(s1, 'audit', 'seed_1')));
    await denied(getDoc(doc(s1, 'users', S2)));
    await denied(getDoc(doc(s1, 'users', OWNER)));
    expect((await getDoc(doc(s1, 'users', S1))).data().role).toBe('staff');
    expect((await getDoc(doc(owner, 'audit', 'seed_1'))).exists()).toBe(true);
  });
});

describe('masters and settings', () => {
  it('staff cannot write jarTypes or items', async () => {
    await denied(setDoc(doc(s1, 'jarTypes', 'new'), { name: 'X', defaultRate: 1 }));
    await denied(updateDoc(doc(s1, 'jarTypes', J), { defaultRate: 1 }));
    await denied(setDoc(doc(s1, 'items', 'new'), { name: 'X', defaultRate: 1 }));
    await denied(updateDoc(doc(s1, 'items', 'item1'), { defaultRate: 1 }));
  });
  it('staff settings: nextBillNo +1 only', async () => {
    const cur = (await getDoc(doc(s1, 'settings', 'main'))).data().nextBillNo;
    await denied(updateDoc(doc(s1, 'settings', 'main'), { nextBillNo: cur + 2 }));
    await denied(updateDoc(doc(s1, 'settings', 'main'), { nextBillNo: cur }));
    await denied(updateDoc(doc(s1, 'settings', 'main'), { nextBillNo: cur - 1 }));
    await denied(updateDoc(doc(s1, 'settings', 'main'), { businessName: 'Hacked' }));
    await denied(updateDoc(doc(s1, 'settings', 'main'), { nextBillNo: cur + 1, billPrefix: 'Z' }));
    await denied(updateDoc(doc(s1, 'settings', 'main'), { upiId: 'a@b' }));
    await allowed(updateDoc(doc(s1, 'settings', 'main'), { nextBillNo: cur + 1 }));
    expect((await getDoc(doc(owner, 'settings', 'main'))).data().nextBillNo).toBe(cur + 1);
  });
  it('owner can change settings and masters', async () => {
    await allowed(updateDoc(doc(owner, 'settings', 'main'), { upiId: 'shop@upi' }));
    await allowed(updateDoc(doc(owner, 'jarTypes', J), { defaultRate: 4500 }));
  });
});

describe('parties', () => {
  it('staff cannot create a party or edit its details', async () => {
    await denied(setDoc(doc(s1, 'parties', 'newp'), { name: 'New', outstanding: 0, depositBalance: 0 }));
    await denied(updateDoc(doc(s1, 'parties', P), { name: 'Renamed' }));
    await denied(updateDoc(doc(s1, 'parties', P), { openingBalance: 5 }));
    await denied(updateDoc(doc(s1, 'parties', P), { outstanding: 5, name: 'Renamed' }));
    await denied(setDoc(doc(s1, 'parties', P), { name: 'Renamed', outstanding: increment(1) }, { merge: true }));
  });
  it('staff can apply a balance-delta merge write (what writePlan does)', async () => {
    await allowed(setDoc(doc(s1, 'parties', P), {
      outstanding: increment(20000), depositBalance: increment(10000), jarBalance: { [J]: increment(3) }, lastTxnAt: serverTimestamp(),
    }, { merge: true }));
    const p = (await getDoc(doc(owner, 'parties', P))).data();
    expect(p.outstanding).toBe(20000);
    expect(p.depositBalance).toBe(10000);
    expect(p.jarBalance[J]).toBe(3);
    expect(p.name).toBe('Ram');
  });
  it('balance change above Rs 5,00,000 in one save is denied, exactly the limit is allowed', async () => {
    await denied(setDoc(doc(s1, 'parties', P), { outstanding: increment(50000001), lastTxnAt: serverTimestamp() }, { merge: true }));
    await denied(setDoc(doc(s1, 'parties', P), { outstanding: increment(-50000001), lastTxnAt: serverTimestamp() }, { merge: true }));
    await denied(setDoc(doc(s1, 'parties', P), { depositBalance: increment(50000001) }, { merge: true }));
    await allowed(setDoc(doc(s1, 'parties', P), { outstanding: increment(50000000), lastTxnAt: serverTimestamp() }, { merge: true }));
    await allowed(setDoc(doc(s1, 'parties', P), { outstanding: increment(-50000000), lastTxnAt: serverTimestamp() }, { merge: true }));
  });
  it('staff cannot write float balances', async () => {
    await denied(setDoc(doc(s1, 'parties', P), { outstanding: 10.5 }, { merge: true }));
  });
  it('staff can set a first location but not change an existing one', async () => {
    const loc = (lat) => ({ lat, lng: 77.2, locAccuracy: 12, locSource: 'gps', locUpdatedAt: serverTimestamp() });
    await allowed(setDoc(doc(s1, 'parties', 'party2'), loc(28.6), { merge: true }));
    await denied(setDoc(doc(s1, 'parties', 'party2'), loc(28.7), { merge: true }));
    await denied(setDoc(doc(s2, 'parties', 'party2'), loc(10), { merge: true }));
    await allowed(setDoc(doc(owner, 'parties', 'party2'), loc(28.9), { merge: true }));
  });
  it('owner can create and edit parties', async () => {
    await allowed(setDoc(doc(owner, 'parties', 'ownerp'), { name: 'Owner party', outstanding: 0, depositBalance: 0 }));
    await allowed(updateDoc(doc(owner, 'parties', 'ownerp'), { name: 'Renamed' }));
  });
});

describe('transaction creation', () => {
  it('staff can create bill / receipt / jarReturn / jarGiven / depositTaken stamped with own uid', async () => {
    const t = (type, extra) => ({ ...billDoc(S1), type, ...extra });
    await allowed(setDoc(doc(s1, 'transactions', newId('c')), t('bill', { total: 100 })));
    await allowed(setDoc(doc(s1, 'transactions', newId('c')), t('receipt', { amount: 5000, verified: false, mode: 'Cash' })));
    await allowed(setDoc(doc(s1, 'transactions', newId('c')), t('jarReturn', { qty: 2, jarTypeId: J })));
    await allowed(setDoc(doc(s1, 'transactions', newId('c')), t('jarGiven', { qty: 2, jarTypeId: J })));
    await allowed(setDoc(doc(s1, 'transactions', newId('c')), t('depositTaken', { amount: 10000 })));
  });
  it('createdBy must be own uid and must exist', async () => {
    await denied(setDoc(doc(s1, 'transactions', newId('c')), billDoc(S2)));
    await denied(setDoc(doc(s1, 'transactions', newId('c')), billDoc(OWNER)));
    const noBy = billDoc(S1); delete noBy.createdBy;
    await denied(setDoc(doc(s1, 'transactions', newId('c')), noBy));
    await denied(setDoc(doc(s1, 'transactions', newId('c')), billDoc(S1, { createdBy: { uid: S1 } })));
  });
  it('staff cannot create depositRefund / depositAdjust / adjustment', async () => {
    for (const type of ['depositRefund', 'depositAdjust', 'adjustment']) {
      await denied(setDoc(doc(s1, 'transactions', newId('c')), { ...billDoc(S1), type, amount: 100 }));
    }
  });
  it('receipt must start unverified', async () => {
    const r = { ...billDoc(S1), type: 'receipt', amount: 100 };
    await denied(setDoc(doc(s1, 'transactions', newId('c')), { ...r, verified: true }));
    await denied(setDoc(doc(s1, 'transactions', newId('c')), r)); // no verified field at all
    await allowed(setDoc(doc(s1, 'transactions', newId('c')), { ...r, verified: false }));
  });
  it('staff cannot create pre-deleted entries or set auditSeq', async () => {
    await denied(setDoc(doc(s1, 'transactions', newId('c')), billDoc(S1, { deleted: true })));
    await denied(setDoc(doc(s1, 'transactions', newId('c')), billDoc(S1, { auditSeq: 3 })));
  });
  it('invalid shapes are denied (float total, bad dateKey)', async () => {
    await denied(setDoc(doc(s1, 'transactions', newId('c')), billDoc(S1, { total: 10.5 })));
    await denied(setDoc(doc(s1, 'transactions', newId('c')), billDoc(S1, { dateKey: '1/3/2026' })));
  });
  it('owner can create every type, and a verified receipt', async () => {
    for (const type of ['depositRefund', 'depositAdjust', 'adjustment']) {
      await allowed(setDoc(doc(owner, 'transactions', newId('o')), { ...billDoc(OWNER), type, amount: 100 }));
    }
    await allowed(setDoc(doc(owner, 'transactions', newId('o')), { ...billDoc(OWNER), type: 'receipt', amount: 1, verified: true }));
    await denied(deleteDoc(doc(owner, 'transactions', 'seedtxn')));
  });
});

describe('staff edit / delete of transactions', () => {
  it('own bill within the hour with a matching audit doc in the same batch is allowed', async () => {
    const id = newId('e'); await setDoc(doc(s1, 'transactions', id), billDoc(S1));
    await allowed(editBatch(s1, S1, id, { total: 30000, subTotal: 30000 }));
    expect((await getDoc(doc(owner, 'transactions', id))).data()).toMatchObject({ total: 30000, auditSeq: 1 });
    expect((await getDoc(doc(owner, 'audit', `${id}_1`))).exists()).toBe(true);
    // a second edit needs seq 2
    await allowed(editBatch(s1, S1, id, { total: 31000 }, { seq: 2 }));
    await denied(editBatch(s1, S1, id, { total: 32000 }, { seq: 2 }));
  });
  it('edit of own jarReturn / depositTaken works too', async () => {
    const j = newId('e'); await setDoc(doc(s1, 'transactions', j), { ...billDoc(S1), type: 'jarReturn', qty: 1, jarTypeId: J });
    await allowed(editBatch(s1, S1, j, { qty: 4 }));
    const d = newId('e'); await setDoc(doc(s1, 'transactions', d), { ...billDoc(S1), type: 'depositTaken', amount: 500 });
    await allowed(editBatch(s1, S1, d, { amount: 600 }));
  });
  it('without an audit doc it is denied (txn update and later audit write are separate)', async () => {
    const id = newId('e'); await setDoc(doc(s1, 'transactions', id), billDoc(S1));
    await denied(editBatch(s1, S1, id, { total: 1 }, { audit: false }));
    await denied(updateDoc(doc(s1, 'transactions', id), { total: 1 }));
  });
  it('wrong auditSeq or wrong audit doc id is denied', async () => {
    const id = newId('e'); await setDoc(doc(s1, 'transactions', id), billDoc(S1));
    await denied(editBatch(s1, S1, id, { total: 1 }, { seq: 2 }));       // skips 1
    await denied(editBatch(s1, S1, id, { total: 1 }, { seq: 0 }));       // no increment
    await denied(editBatch(s1, S1, id, { total: 1 }, { seq: 1, auditId: `${id}_9` })); // audit id does not match
    await denied(editBatch(s1, S1, id, { total: 1 }, { seq: 1, auditId: `other_1` }));
    await allowed(editBatch(s1, S1, id, { total: 1 }));
  });
  it("another staff member's bill is denied, owner's bill is denied", async () => {
    const id = newId('e'); await setDoc(doc(s1, 'transactions', id), billDoc(S1));
    await denied(editBatch(s2, S2, id, { total: 5 }));
    const o = newId('e'); await seedTxn(o, billDoc(OWNER));
    await denied(editBatch(s1, S1, o, { total: 5 }));
    const nob = newId('e'); const x = billDoc(OWNER); delete x.createdBy; await seedTxn(nob, x);
    await denied(editBatch(s1, S1, nob, { total: 5 }));
  });
  it('after one hour it is denied (same edit on a fresh bill passes)', async () => {
    const old = newId('e'); await seedTxn(old, billDoc(S1, { createdAt: hoursAgo(2) }));
    await denied(editBatch(s1, S1, old, { total: 5 }));
    const justUnder = newId('e'); await seedTxn(justUnder, billDoc(S1, { createdAt: hoursAgo(0.5) }));
    await allowed(editBatch(s1, S1, justUnder, { total: 5 }));
    const justOver = newId('e'); await seedTxn(justOver, billDoc(S1, { createdAt: Timestamp.fromMillis(Date.now() - 3600 * 1000 - 5000) }));
    await denied(editBatch(s1, S1, justOver, { total: 5 }));
    // owner can still edit an old one
    await allowed(updateDoc(doc(owner, 'transactions', old), { total: 7 }));
  });
  it('receipt edit is denied for staff', async () => {
    const id = newId('e'); await setDoc(doc(s1, 'transactions', id), { ...billDoc(S1), type: 'receipt', amount: 100, verified: false });
    await denied(editBatch(s1, S1, id, { amount: 200 }));
    await denied(editBatch(s1, S1, id, { verified: true }));
    await denied(editBatch(s1, S1, id, { deleted: true }));
  });
  it('restore (deleted true -> false) is denied for staff, allowed for owner', async () => {
    const id = newId('e'); await seedTxn(id, billDoc(S1, { deleted: true }));
    await denied(editBatch(s1, S1, id, { deleted: false }, { action: 'restore' }));
    await allowed(updateDoc(doc(owner, 'transactions', id), { deleted: false }));
  });
  it('changing partyId, type, createdBy or createdAt is denied', async () => {
    const id = newId('e'); await setDoc(doc(s1, 'transactions', id), billDoc(S1));
    await denied(editBatch(s1, S1, id, { partyId: 'party2' }));
    await denied(editBatch(s1, S1, id, { type: 'receipt', amount: 1, verified: false }));
    await denied(editBatch(s1, S1, id, { type: 'jarGiven', qty: 1 }));
    await denied(editBatch(s1, S1, id, { createdBy: me(S2, 'N') }));
    await denied(editBatch(s1, S1, id, { createdAt: hoursAgo(0) }));
    await denied(editBatch(s1, S1, id, { total: 1.5 }));
  });
  it('staff soft delete of own bill with audit is allowed; a second delete needs seq 2', async () => {
    const id = newId('e'); await setDoc(doc(s1, 'transactions', id), billDoc(S1));
    const b = writeBatch(s1);
    b.update(doc(s1, 'transactions', id), { deleted: true, deletedAt: serverTimestamp(), updatedAt: serverTimestamp(), auditSeq: 1 });
    b.set(doc(s1, 'audit', `${id}_1`), auditData(id, S1, 'delete'));
    await allowed(b.commit());
    expect((await getDoc(doc(owner, 'transactions', id))).data().deleted).toBe(true);
    const b2 = writeBatch(s1);
    b2.update(doc(s1, 'transactions', id), { deleted: true, auditSeq: 1 });
    await denied(b2.commit());
  });
  it('staff soft delete without audit, of someone else bill, or old bill is denied', async () => {
    const id = newId('e'); await setDoc(doc(s1, 'transactions', id), billDoc(S1));
    await denied(updateDoc(doc(s1, 'transactions', id), { deleted: true, auditSeq: 1 }));
    await denied(editBatch(s2, S2, id, { deleted: true }, { action: 'delete' }));
    const old = newId('e'); await seedTxn(old, billDoc(S1, { createdAt: hoursAgo(3) }));
    await denied(editBatch(s1, S1, old, { deleted: true }, { action: 'delete' }));
  });
  it('hard delete is denied for everyone', async () => {
    const id = newId('e'); await setDoc(doc(s1, 'transactions', id), billDoc(S1));
    await denied(deleteDoc(doc(s1, 'transactions', id)));
    await denied(deleteDoc(doc(owner, 'transactions', id)));
  });
});

describe('audit log', () => {
  it('cannot be updated or deleted by anyone', async () => {
    await denied(updateDoc(doc(owner, 'audit', 'seed_1'), { action: 'delete' }));
    await denied(deleteDoc(doc(owner, 'audit', 'seed_1')));
    const id = newId('a'); await setDoc(doc(s1, 'transactions', id), billDoc(S1));
    await allowed(editBatch(s1, S1, id, { total: 9 }));
    await denied(updateDoc(doc(s1, 'audit', `${id}_1`), { action: 'delete' }));
    await denied(deleteDoc(doc(s1, 'audit', `${id}_1`)));
    await denied(setDoc(doc(s1, 'audit', `${id}_1`), auditData(id, S1))); // overwrite = update
  });
  it('staff audit needs by.uid == own uid and at == server time', async () => {
    await denied(setDoc(doc(s1, 'audit', newId('a')), auditData('t', S2)));
    await denied(setDoc(doc(s1, 'audit', newId('a')), auditData('t', S1, 'edit', { at: Timestamp.now() })));
    await denied(setDoc(doc(s1, 'audit', newId('a')), auditData('t', S1, 'edit', { at: hoursAgo(5) })));
    await denied(setDoc(doc(s1, 'audit', newId('a')), auditData('t', S1, 'hack')));
    await denied(setDoc(doc(s1, 'audit', newId('a')), auditData('t', S1, 'edit', { by: 'me' })));
    await allowed(setDoc(doc(s1, 'audit', newId('a')), auditData('t', S1)));
    await denied(setDoc(doc(blocked, 'audit', newId('a')), auditData('t', BLOCKED)));
    await denied(setDoc(doc(stranger, 'audit', newId('a')), auditData('t', STRANGER)));
  });
  it('owner can write audit and read it', async () => {
    const id = newId('a');
    await allowed(setDoc(doc(owner, 'audit', id), auditData('t', OWNER, 'restore')));
    expect((await getDoc(doc(owner, 'audit', id))).data().action).toBe('restore');
  });
});

describe('users docs', () => {
  it('only the owner creates or updates users', async () => {
    await allowed(setDoc(doc(owner, 'users', 'newstaff'), { name: 'New', role: 'staff', active: true }));
    await allowed(updateDoc(doc(owner, 'users', 'newstaff'), { active: false }));
    await denied(setDoc(doc(owner, 'users', 'bad1'), { name: 'X', role: 'boss', active: true }));
    await denied(setDoc(doc(owner, 'users', 'bad2'), { name: '', role: 'staff', active: true }));
    await denied(setDoc(doc(owner, 'users', 'bad3'), { name: 'X', role: 'staff', active: 'yes' }));
    await denied(setDoc(doc(owner, 'users', 'bad4'), { name: 'X', role: 'staff', active: true, lang: 'fr' }));
    await denied(setDoc(doc(s1, 'users', 'evil'), { name: 'Evil', role: 'admin', active: true }));
    await denied(setDoc(doc(stranger, 'users', STRANGER), { name: 'Me', role: 'admin', active: true }));
    await denied(setDoc(doc(s1, 'users', S1), { name: 'Staff One', role: 'admin', active: true }));
  });
  it('staff can change only their own lang to en or hi', async () => {
    await allowed(updateDoc(doc(s1, 'users', S1), { lang: 'hi' }));
    await allowed(updateDoc(doc(s1, 'users', S1), { lang: 'en' }));
    await denied(updateDoc(doc(s1, 'users', S1), { lang: 'fr' }));
    await denied(updateDoc(doc(s1, 'users', S1), { lang: 'hi', name: 'Boss' }));
    await denied(updateDoc(doc(s1, 'users', S1), { role: 'admin' }));
    await denied(updateDoc(doc(s1, 'users', S1), { active: false }));
    await denied(updateDoc(doc(s1, 'users', S2), { lang: 'hi' }));
    await denied(updateDoc(doc(blocked, 'users', BLOCKED), { lang: 'hi' }));
  });
  it('nobody deletes users', async () => {
    await denied(deleteDoc(doc(owner, 'users', S2)));
    await denied(deleteDoc(doc(s1, 'users', S1)));
  });
});

describe('stats', () => {
  it('staff can write stats (increment merge), blocked cannot', async () => {
    await allowed(setDoc(doc(s1, 'stats', 'summary'), { totalOutstanding: increment(5), totalJarsOut: { [J]: increment(1) } }, { merge: true }));
    await allowed(setDoc(doc(s1, 'stats', 'daily_2026-03-01'), { dateKey: DAY, sales: increment(100), collection: increment(0), billsCount: increment(1) }, { merge: true }));
    await denied(setDoc(doc(s1, 'stats', 'summary'), { totalOutstanding: 1.5 }, { merge: true }));
    await denied(deleteDoc(doc(s1, 'stats', 'summary')));
  });
  it('unknown collections are denied even for the owner', async () => {
    await denied(setDoc(doc(owner, 'secrets', 'x'), { a: 1 }));
    await denied(getDoc(doc(s1, 'secrets', 'x')));
  });
});

// A bill exactly like api.createBill: settings read, bill write, linked deposit + jar return, party/stats increments, nextBillNo + 1
async function billFlow(db, uid) {
  return runTransaction(db, async (tx) => {
    const sRef = doc(db, 'settings', 'main');
    const pRef = doc(db, 'parties', P);
    const [sSnap, pSnap] = await Promise.all([tx.get(sRef), tx.get(pRef)]);
    const seq = sSnap.data().nextBillNo;
    const prev = pSnap.data().outstanding || 0;
    const stamp = { deleted: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: me(uid, 'N'), date: Timestamp.now() };
    const billRef = doc(collection(db, 'transactions'));
    tx.set(billRef, { ...stamp, type: 'bill', partyId: P, partyName: 'Ram', dateKey: DAY, billNo: String(seq), billSeq: seq, total: 20000, subTotal: 20000, discount: 0, extraCharge: 0, prevOutstanding: prev, newOutstanding: prev + 20000, depositCollectedInBill: 10000, returnedInBill: { [J]: 2 }, lines: [{ itemId: 'item1', qty: 5, rate: 4000, amount: 20000 }] });
    tx.set(doc(collection(db, 'transactions')), { ...stamp, type: 'depositTaken', partyId: P, partyName: 'Ram', dateKey: DAY, jarTypeId: J, amount: 10000, note: 'With bill', linkedBillId: billRef.id });
    tx.set(doc(collection(db, 'transactions')), { ...stamp, type: 'jarReturn', partyId: P, partyName: 'Ram', dateKey: DAY, jarTypeId: J, qty: 2, note: 'With bill', linkedBillId: billRef.id });
    tx.update(sRef, { nextBillNo: seq + 1 });
    tx.set(pRef, { outstanding: increment(20000), depositBalance: increment(10000), jarBalance: { [J]: increment(3) }, lastTxnAt: serverTimestamp() }, { merge: true });
    tx.set(doc(db, 'stats', 'summary'), { totalOutstanding: increment(20000), totalDepositHeld: increment(10000), totalJarsOut: { [J]: increment(3) } }, { merge: true });
    tx.set(doc(db, 'stats', 'daily_2026-03-02'), { dateKey: '2026-03-02', sales: increment(20000), collection: increment(0), billsCount: increment(1) }, { merge: true });
    return { id: billRef.id, seq };
  });
}

describe('full bill transaction (same shape as api.createBill)', () => {
  it('staff creates a full bill and the counter moves by one', async () => {
    const before = (await getDoc(doc(owner, 'settings', 'main'))).data().nextBillNo;
    const r = await billFlow(s1, S1);
    expect(r.seq).toBe(before);
    expect((await getDoc(doc(owner, 'settings', 'main'))).data().nextBillNo).toBe(before + 1);
    expect((await getDoc(doc(owner, 'transactions', r.id))).data().createdBy.uid).toBe(S1);
  });
  it('owner creates a full bill too', async () => {
    const before = (await getDoc(doc(owner, 'settings', 'main'))).data().nextBillNo;
    await billFlow(owner, OWNER);
    expect((await getDoc(doc(owner, 'settings', 'main'))).data().nextBillNo).toBe(before + 1);
  });
  it('blocked staff and stranger cannot', async () => {
    await denied(billFlow(blocked, BLOCKED));
    await denied(billFlow(stranger, STRANGER));
  });
});

describe('real api.js flows', () => {
  const clean = () => ({ id: undefined });
  it('owner: createBill, updateTxn, softDelete, restore, verifyReceipt write valid audit records', async () => {
    const api = await loadApi(OWNER);
    api.setActor({ uid: OWNER, name: 'Owner', role: 'admin' });
    const pid = 'apiparty';
    await setDoc(doc(owner, 'parties', pid), { name: 'Api Party', outstanding: 0, depositBalance: 0, openingBalance: 0, openingDeposit: 0, jarBalance: {} });
    const r = await api.createBill({ type: 'bill', partyId: pid, partyName: 'Api Party', dateKey: DAY, lines: [{ itemId: 'item1', itemName: 'Water', jarTypeId: J, qty: 2, rate: 4000, amount: 8000, jarGiven: true }], subTotal: 8000, discount: 0, extraCharge: 0, total: 8000, note: '', depositAmount: 10000, depositJarTypeId: J, returns: { [J]: 1 } });
    let t = (await getDoc(doc(owner, 'transactions', r.id))).data();
    expect(t.createdBy.uid).toBe(OWNER);
    await api.updateTxn({ id: r.id, ...t }, { note: 'edited' });
    expect((await getDoc(doc(owner, 'audit', `${r.id}_1`))).data().by.uid).toBe(OWNER);
    await api.softDeleteTxn({ id: r.id }, { withLinked: true });
    expect((await getDoc(doc(owner, 'transactions', r.id))).data().deleted).toBe(true);
    await api.restoreTxn({ id: r.id }, { withLinked: true });
    expect((await getDoc(doc(owner, 'transactions', r.id))).data()).toMatchObject({ deleted: false, auditSeq: 3 });
    const rec = await api.createEntry({ type: 'receipt', partyId: pid, partyName: 'Api Party', dateKey: DAY, amount: 100, mode: 'UPI', reference: '', note: '' });
    expect((await getDoc(doc(owner, 'transactions', rec.id))).data().verified).toBe(true);
    await api.verifyReceipt({ id: rec.id });
    void clean;
  });

  it('staff: createBill, createEntry, edit, delete work; restore, receipt edit, party and verify are blocked', async () => {
    const api = await loadApi(S1);
    api.setActor({ uid: S1, name: 'Staff One', role: 'staff' });
    const pid = 'apiparty2';
    await setDoc(doc(owner, 'parties', pid), { name: 'Api Party 2', outstanding: 0, depositBalance: 0, openingBalance: 0, openingDeposit: 0, jarBalance: {} });
    const r = await api.createBill({ type: 'bill', partyId: pid, partyName: 'Api Party 2', dateKey: DAY, lines: [{ itemId: 'item1', itemName: 'Water', jarTypeId: J, qty: 2, rate: 4000, amount: 8000, jarGiven: true }], subTotal: 8000, discount: 0, extraCharge: 0, total: 8000, note: '', depositAmount: 10000, depositJarTypeId: J, returns: { [J]: 1 } });
    expect((await getDoc(doc(owner, 'transactions', r.id))).data().createdBy.uid).toBe(S1);
    let party = (await getDoc(doc(owner, 'parties', pid))).data();
    expect(party.outstanding).toBe(8000);
    expect(party.depositBalance).toBe(10000);

    const rec = await api.createEntry({ type: 'receipt', partyId: pid, partyName: 'Api Party 2', dateKey: DAY, amount: 500, mode: 'UPI', reference: '', note: '' });
    expect((await getDoc(doc(owner, 'transactions', rec.id))).data().verified).toBe(false);
    const jr = await api.createEntry({ type: 'jarReturn', partyId: pid, partyName: 'Api Party 2', dateKey: DAY, jarTypeId: J, qty: 1, note: '' });
    expect(jr.id).toBeTruthy();

    // edit own bill (total 8000 -> 9000), balance delta applied
    const bill = { id: r.id, ...(await getDoc(doc(owner, 'transactions', r.id))).data() };
    await api.updateTxn(bill, { total: 9000, subTotal: 9000 });
    expect((await getDoc(doc(owner, 'transactions', r.id))).data()).toMatchObject({ total: 9000, auditSeq: 1 });
    party = (await getDoc(doc(owner, 'parties', pid))).data();
    expect(party.outstanding).toBe(9000 - 500);
    expect((await getDoc(doc(owner, 'audit', `${r.id}_1`))).data().by.uid).toBe(S1);

    // blocked operations
    console.log('REC', JSON.stringify((await getDoc(doc(owner, 'transactions', rec.id))).data()));
    console.log('RES', await api.updateTxn({ id: rec.id }, { amount: 900 }).catch((e) => e.code));
    console.log('REC2', JSON.stringify((await getDoc(doc(owner, 'transactions', rec.id))).data()));
    await expect(api.updateTxn({ id: rec.id }, { amount: 900 })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(api.verifyReceipt({ id: rec.id })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(api.softDeleteTxn({ id: rec.id })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(api.createParty({ name: 'Nope', phone: '', address: '', notes: '', active: true, openingBalance: 0, openingJars: {}, openingDeposit: 0, jarRates: {}, itemRates: {} })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(api.createEntry({ type: 'adjustment', partyId: pid, partyName: 'x', dateKey: DAY, amount: 100, note: '' })).rejects.toMatchObject({ code: 'permission-denied' });

    // delete own bill with the linked entries, then restore is denied
    await api.softDeleteTxn({ id: r.id }, { withLinked: true });
    expect((await getDoc(doc(owner, 'transactions', r.id))).data().deleted).toBe(true);
    party = (await getDoc(doc(owner, 'parties', pid))).data();
    expect(party.outstanding).toBe(-500);
    await expect(api.restoreTxn({ id: r.id }, { withLinked: true })).rejects.toMatchObject({ code: 'permission-denied' });

    // another staff member cannot edit this staff member's other entry; entries older than an hour are locked
    const old = 'api_old_bill';
    await seedTxn(old, billDoc(S1, { partyId: pid, createdAt: hoursAgo(2) }));
    await expect(api.updateTxn({ id: old }, { note: 'late' })).rejects.toMatchObject({ code: 'permission-denied' });
    const api2 = await loadApi(S2);
    api2.setActor({ uid: S2, name: 'Staff Two', role: 'staff' });
    const mineBill = 'api_s1_bill';
    await seedTxn(mineBill, billDoc(S1, { partyId: pid }));
    await expect(api2.updateTxn({ id: mineBill }, { note: 'steal' })).rejects.toMatchObject({ code: 'permission-denied' });
  }, 120000);
});
