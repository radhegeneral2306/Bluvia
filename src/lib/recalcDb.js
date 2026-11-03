import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from './firebase.js';
import { addReads } from './reads.js';
import { recalculate, diffRecalc } from './ledger.js';

/** Reads EVERYTHING (many reads). Returns calc + diffs without writing. */
export async function computeRecalc(onProgress = () => {}) {
  onProgress('parties');
  const pSnap = await getDocs(collection(db, 'parties')); addReads(Math.max(1, pSnap.size));
  onProgress('transactions');
  const tSnap = await getDocs(collection(db, 'transactions')); addReads(Math.max(1, tSnap.size));
  onProgress('stats');
  const sSnap = await getDocs(collection(db, 'stats')); addReads(Math.max(1, sSnap.size));
  const parties = pSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const txns = tSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  let summary = {}; const daily = {};
  sSnap.docs.forEach((d) => { if (d.id === 'summary') summary = d.data(); else if (d.id.startsWith('daily_')) daily[d.id.slice(6)] = d.data(); });
  const calc = recalculate(parties, txns);
  const diffs = diffRecalc(parties, calc, summary, daily);
  return { calc, diffs, parties, txnCount: txns.length, dailyKeys: Object.keys(daily) };
}

/** Writes ONLY the documents that actually differ (saves free-plan writes). */
export async function applyRecalc({ calc, diffs, dailyKeys }) {
  const partyIds = new Set(diffs.filter((d) => d.scope === 'party').map((d) => d.id));
  const dailyDiff = new Set(diffs.filter((d) => d.scope === 'daily').map((d) => d.id));
  const ops = [];
  for (const id of partyIds) {
    const b = calc.balances[id];
    ops.push((w) => w.update(doc(db, 'parties', id), { outstanding: b.outstanding, depositBalance: b.depositBalance, jarBalance: b.jarBalance }));
  }
  if (diffs.some((d) => d.scope === 'summary')) ops.push((w) => w.set(doc(db, 'stats', 'summary'), calc.summary));
  for (const k of dailyDiff) {
    const d = calc.daily[k] || { sales: 0, collection: 0, billsCount: 0 };
    ops.push((w) => w.set(doc(db, 'stats', `daily_${k}`), { dateKey: k, ...d }));
  }
  void dailyKeys;
  for (let i = 0; i < ops.length; i += 400) {
    const b = writeBatch(db);
    ops.slice(i, i + 400).forEach((op) => op(b));
    await b.commit();
  }
  return ops.length;
}
