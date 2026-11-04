// All Firestore reads/writes live here. Balance changes always go through ledger.planChange(s)
// and are written as increment() deltas inside ONE batch/transaction.
import {
  collection, doc, getDoc, getDocs, query, where, orderBy, limit, startAfter, writeBatch,
  runTransaction, increment, serverTimestamp, Timestamp, setDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { addReads } from '../lib/reads.js';
import { dateFromKey, startOfKey, endOfKey } from '../lib/dates.js';
import { planChange, planChanges, openingState, openingDelta, effectOf } from '../lib/ledger.js';

export const tsFromKey = (key) => Timestamp.fromDate(dateFromKey(key));
export const withId = (d) => ({ id: d.id, ...d.data() });

export async function qDocs(q) {
  const s = await getDocs(q);
  addReads(Math.max(1, s.size));
  return s;
}
export async function getOne(path, id) {
  const s = await getDoc(doc(db, path, id));
  addReads(1);
  return s.exists() ? withId(s) : null;
}

/** Wait for the server, but if internet is slow/absent treat as "queued on phone" and move on. */
export async function commitSafe(promise) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    promise.catch((e) => console.error('Queued write failed later', e));
    return 'queued';
  }
  const timeout = new Promise((r) => setTimeout(() => r('queued'), 7000));
  const res = await Promise.race([promise.then(() => 'done'), timeout]);
  if (res === 'queued') promise.catch((e) => console.error('Queued write failed later', e));
  return res;
}

// ---------- plan -> firestore increments ----------
function partyDelta(e, touch = true) {
  const d = touch ? { lastTxnAt: serverTimestamp() } : {};
  if (e.outstanding) d.outstanding = increment(e.outstanding);
  if (e.deposit) d.depositBalance = increment(e.deposit);
  const jars = Object.entries(e.jars);
  if (jars.length) d.jarBalance = Object.fromEntries(jars.map(([k, v]) => [k, increment(v)]));
  return d;
}
export function writePlan(w, plan) {
  for (const [pid, e] of Object.entries(plan.parties)) w.set(doc(db, 'parties', pid), partyDelta(e), { merge: true });
  writeGlobal(w, plan.global);
}
function writeGlobal(w, g) {
  const s = {};
  if (g.outstanding) s.totalOutstanding = increment(g.outstanding);
  if (g.deposit) s.totalDepositHeld = increment(g.deposit);
  const jars = Object.entries(g.jars);
  if (jars.length) s.totalJarsOut = Object.fromEntries(jars.map(([k, v]) => [k, increment(v)]));
  if (Object.keys(s).length) w.set(doc(db, 'stats', 'summary'), s, { merge: true });
  for (const [k, v] of Object.entries(g.daily)) {
    w.set(doc(db, 'stats', `daily_${k}`), {
      dateKey: k, sales: increment(v.sales), collection: increment(v.collection), billsCount: increment(v.billsCount),
    }, { merge: true });
  }
}

// ---------- settings / masters ----------
export const DEFAULT_SETTINGS = {
  businessName: 'Bluvia Pure Drinking Water', managerName: '', address: '', phone: '', billPrefix: '', billNoPad: 5, nextBillNo: 1,
  invoiceFor: 'Drinking water supply.', showDuesOnPdf: true,
  footerNote: 'THANK YOU FOR YOUR BUSINESS!', paymentModes: ['Cash', 'UPI', 'Bank'], currency: '₹', countryCode: '91', areas: [],
  upiId: '', upiName: '', upiRemark: 'Bill {billNo}', upiQrAmount: 'bill',
};

export async function seedDefaults() {
  await runTransaction(db, async (b) => {
  const existing = await b.get(doc(db, 'settings', 'main'));
  if (existing.exists()) return; // another device already seeded
  b.set(doc(db, 'settings', 'main'), { ...DEFAULT_SETTINGS, createdAt: serverTimestamp() });
  const j20 = doc(collection(db, 'jarTypes')), j10 = doc(collection(db, 'jarTypes'));
  b.set(j20, { name: '20L Jar', defaultRate: 4000, defaultDeposit: 20000, active: true });
  b.set(j10, { name: '10L Jar', defaultRate: 2500, defaultDeposit: 10000, active: true });
  b.set(doc(collection(db, 'items')), { name: '20L Jar Water', unit: 'jar', defaultRate: 4000, jarTypeId: j20.id, active: true });
  b.set(doc(collection(db, 'items')), { name: '10L Jar Water', unit: 'jar', defaultRate: 2500, jarTypeId: j10.id, active: true });
  b.set(doc(db, 'stats', 'summary'), { totalOutstanding: 0, totalJarsOut: {}, totalDepositHeld: 0 });
  });
}
export const saveSettings = (patch) => commitSafe(setDoc(doc(db, 'settings', 'main'), patch, { merge: true }));

export function saveMaster(coll, id, data) {
  const ref = id ? doc(db, coll, id) : doc(collection(db, coll));
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  return commitSafe(setDoc(ref, clean, { merge: true }));
}

// ---------- parties ----------
export async function createParty(data) {
  const ref = doc(collection(db, 'parties'));
  const o = openingState(data);
  const b = writeBatch(db);
  b.set(ref, { ...data, ...o, lastTxnAt: null, createdAt: serverTimestamp() });
  const e = openingDelta({}, data);
  writeGlobal(b, { ...e, daily: {} });
  await commitSafe(b.commit());
  return ref.id;
}
export async function updateParty(id, oldP, data) {
  const b = writeBatch(db);
  b.update(doc(db, 'parties', id), { ...data, updatedAt: serverTimestamp() }); // update() replaces nested maps (jarRates etc.)
  const e = openingDelta(oldP, data);
  if (e.outstanding || e.deposit || Object.keys(e.jars).length) {
    b.set(doc(db, 'parties', id), partyDelta(e, false), { merge: true });
    writeGlobal(b, e);
  }
  // NOTE: second set on same doc inside one batch is fine: writes apply in order.
  return commitSafe(b.commit());
}

/** Saves a party's location. source: 'gps' | 'link'. Only writes location fields (no balances). */
export async function saveLocation(partyId, { lat, lng, accuracy = null, source = 'gps' }) {
  const data = { lat, lng, locSource: source, locUpdatedAt: serverTimestamp() };
  data.locAccuracy = accuracy === null || accuracy === undefined ? null : Math.round(accuracy);
  return commitSafe(setDoc(doc(db, 'parties', partyId), data, { merge: true }));
}

// ---------- transactions ----------
const base = (t) => ({ deleted: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...t, date: tsFromKey(t.dateKey) });

/** receipts, jar entries, deposit entries, adjustments (offline-safe, no bill number needed) */
export async function createEntry(t) {
  const ref = doc(collection(db, 'transactions'));
  const b = writeBatch(db);
  b.set(ref, base(t));
  writeDeltaOnly(b, planChange(null, t));
  const r = await commitSafe(b.commit());
  return { id: ref.id, status: r };
}
function writeDeltaOnly(b, plan) { writePlan(b, plan); }

/** Bill: needs internet (bill number via transaction on settings/main). Saves optional deposit entry too. */
export async function createBill(input) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const err = new Error('Bill banane ke liye internet chahiye (bill number server se aata hai). Receipt / jar / deposit offline save ho sakte hain.');
    err.code = 'OFFLINE_BILL';
    throw err;
  }
  const { depositAmount = 0, depositJarTypeId = null, returns = {}, ...bill } = input;
  try {
  return await runTransaction(db, async (tx) => {
    const sRef = doc(db, 'settings', 'main');
    const pRef = doc(db, 'parties', bill.partyId);
    const [sSnap, pSnap] = await Promise.all([tx.get(sRef), tx.get(pRef)]);
    addReads(2); // settings + party read inside the transaction (counted again if Firestore retries)
    const s = sSnap.data() || {};
    const p = pSnap.data() || {};
    const seq = s.nextBillNo || 1;
    const billNo = `${s.billPrefix || ''}${String(seq).padStart(s.billNoPad || 0, '0')}`;
    const eff = effectOf(bill);
    const jarAfter = { ...(p.jarBalance || {}) };
    for (const [k, v] of Object.entries(eff.jars)) jarAfter[k] = (jarAfter[k] || 0) + v;
    for (const [k, v] of Object.entries(returns)) if (v) jarAfter[k] = (jarAfter[k] || 0) - v;
    const prevOutstanding = p.outstanding || 0;
    const billRef = doc(collection(db, 'transactions'));
    const doc1 = base({
      ...bill, billNo, billSeq: seq, prevOutstanding, newOutstanding: prevOutstanding + bill.total,
      jarBalanceAfter: jarAfter, depositCollectedInBill: depositAmount || 0, returnedInBill: returns,
    });
    const pairs = [[null, { ...doc1, id: billRef.id }]];
    tx.set(billRef, doc1);
    if (depositAmount > 0) {
      const dRef = doc(collection(db, 'transactions'));
      const d = base({
        type: 'depositTaken', partyId: bill.partyId, partyName: bill.partyName, dateKey: bill.dateKey,
        jarTypeId: depositJarTypeId, amount: depositAmount, note: `With bill ${billNo}`, linkedBillId: billRef.id,
      });
      tx.set(dRef, d);
      pairs.push([null, d]);
    }
    // jars returned along with the bill: one separate jarReturn entry per jar type (so they show in the Jars ledger)
    for (const [jarTypeId, qty] of Object.entries(returns)) {
      if (!qty) continue;
      const rRef = doc(collection(db, 'transactions'));
      const r = base({
        type: 'jarReturn', partyId: bill.partyId, partyName: bill.partyName, dateKey: bill.dateKey,
        jarTypeId, qty, note: `With bill ${billNo}`, linkedBillId: billRef.id,
      });
      tx.set(rRef, r);
      pairs.push([null, r]);
    }
    tx.update(sRef, { nextBillNo: seq + 1 });
    writePlan(tx, planChanges(pairs));
    return { id: billRef.id, billNo, prevOutstanding, jarBalanceAfter: jarAfter };
  });
  } catch (e) {
    if (e?.code === 'OFFLINE_BILL') throw e;
    const connection = ['unavailable', 'deadline-exceeded', 'failed-precondition'].includes(e?.code)
      || /connection|network|offline|timed? ?out/i.test(e?.message || '');
    if (connection) {
      const err = new Error('Internet slow ya band hai. Bill save nahi hua, thodi der baad dobara try karo.');
      err.code = 'BILL_CONNECTION';
      throw err;
    }
    throw e;
  }
}

/** Re-read the entry from the server (when online) so a stale form can never double-apply a delta. */
async function fresh(oldT, { allowDeleted = false } = {}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return oldT;
  const snap = await getDoc(doc(db, 'transactions', oldT.id));
  addReads(1);
  if (!snap.exists()) throw new Error('Yeh entry ab exist nahi karti.');
  const cur = withId(snap);
  if (!allowDeleted && cur.deleted) throw new Error('Yeh entry kahin aur se delete ho chuki hai. Page refresh karo.');
  return cur;
}

/** Edit any transaction: only the delta between old and new effect is applied. */
export async function updateTxn(oldT0, patch) {
  const oldT = await fresh(oldT0);
  const newT = { ...oldT, ...patch };
  const b = writeBatch(db);
  const data = { ...patch, updatedAt: serverTimestamp() };
  if (patch.dateKey) data.date = tsFromKey(patch.dateKey);
  if (oldT.type === 'bill' && patch.total != null) data.newOutstanding = (oldT.prevOutstanding || 0) + patch.total;
  b.update(doc(db, 'transactions', oldT.id), data);
  writePlan(b, planChange(oldT, newT));
  return commitSafe(b.commit());
}
/** Non-deleted entries that were created together with a bill (deposit taken, jars returned). */
export async function findLinked(billId) {
  const snap = await qDocs(query(collection(db, 'transactions'), where('linkedBillId', '==', billId), where('deleted', '==', false)));
  return snap.docs.map(withId);
}

/** Soft delete. With { withLinked: true } the deposit/jar-return entries made with the same bill go too (one batch). */
export async function softDeleteTxn(oldT0, { withLinked = false } = {}) {
  const oldT = await fresh(oldT0);
  const b = writeBatch(db);
  const pairs = [[oldT, { ...oldT, deleted: true }]];
  b.update(doc(db, 'transactions', oldT.id), { deleted: true, deletedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  if (withLinked && oldT.type === 'bill') {
    for (const l of await findLinked(oldT.id)) {
      b.update(doc(db, 'transactions', l.id), { deleted: true, deletedAt: serverTimestamp(), updatedAt: serverTimestamp() });
      pairs.push([l, { ...l, deleted: true }]);
    }
  }
  writePlan(b, planChanges(pairs));
  return commitSafe(b.commit());
}
/** Entries made together with a bill (deposit taken, jars returned) that are currently deleted. */
export async function findDeletedLinked(billId) {
  const snap = await qDocs(query(collection(db, 'transactions'), where('linkedBillId', '==', billId), where('deleted', '==', true)));
  return snap.docs.map(withId);
}

/** Restore. With { withLinked: true } the deposit/jar-return entries that belong to the same bill come back too (one batch). */
export async function restoreTxn(oldT0, { withLinked = false } = {}) {
  const oldT = await fresh(oldT0, { allowDeleted: true });
  if (!oldT.deleted) throw new Error('Yeh entry pehle se active hai.');
  const b = writeBatch(db);
  const pairs = [[{ ...oldT, deleted: true }, { ...oldT, deleted: false }]];
  b.update(doc(db, 'transactions', oldT.id), { deleted: false, updatedAt: serverTimestamp() });
  if (withLinked && oldT.type === 'bill') {
    for (const l of await findDeletedLinked(oldT.id)) {
      b.update(doc(db, 'transactions', l.id), { deleted: false, updatedAt: serverTimestamp() });
      pairs.push([{ ...l, deleted: true }, { ...l, deleted: false }]);
    }
  }
  writePlan(b, planChanges(pairs));
  return commitSafe(b.commit());
}

/** Paginated list. Never loads everything. */
export async function listTxns({ partyId, type, from, to, deleted = false, after = null, pageSize = 30 }) {
  const c = [];
  if (partyId) c.push(where('partyId', '==', partyId));
  if (type) c.push(where('type', '==', type));
  c.push(where('deleted', '==', deleted));
  if (from) c.push(where('date', '>=', Timestamp.fromDate(startOfKey(from))));
  if (to) c.push(where('date', '<=', Timestamp.fromDate(endOfKey(to))));
  if (deleted) c.push(orderBy('updatedAt', 'desc'));
  else { c.push(orderBy('date', 'desc')); c.push(orderBy('createdAt', 'desc')); }
  if (after) c.push(startAfter(after));
  c.push(limit(pageSize));
  const snap = await qDocs(query(collection(db, 'transactions'), ...c));
  return { items: snap.docs.map(withId), last: snap.docs[snap.docs.length - 1] || null, hasMore: snap.size === pageSize };
}
