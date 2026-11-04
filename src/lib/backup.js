import { collection, doc, getDocs, writeBatch, Timestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase.js';
import { addReads } from './reads.js';

export const COLLECTIONS = ['jarTypes', 'items', 'parties', 'transactions', 'stats'];
const MONEY_KEYS = new Set([
  'outstanding', 'depositBalance', 'openingBalance', 'openingDeposit', 'total', 'subTotal', 'discount',
  'extraCharge', 'amount', 'defaultRate', 'defaultDeposit', 'depositCollectedInBill', 'prevOutstanding',
  'newOutstanding', 'totalOutstanding', 'totalDepositHeld', 'sales', 'collection', 'rate',
]);

const ser = (v) => {
  if (v instanceof Timestamp) return { __ts: v.toMillis() };
  if (Array.isArray(v)) return v.map(ser);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, ser(x)]));
  return v;
};
const deser = (v) => {
  if (Array.isArray(v)) return v.map(deser);
  if (v && typeof v === 'object') {
    if (Object.keys(v).length === 1 && typeof v.__ts === 'number') return Timestamp.fromMillis(v.__ts);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deser(x)]));
  }
  return v;
};

export async function exportAll(onProgress = () => {}) {
  const out = { app: 'bluvia', version: 1, exportedAt: new Date().toISOString(), data: {} };
  const s = await getDocs(collection(db, 'settings'));
  addReads(Math.max(1, s.size));
  out.data.settings = s.docs.map((d) => ({ id: d.id, ...ser(d.data()) }));
  for (const c of COLLECTIONS) {
    onProgress(c);
    const snap = await getDocs(collection(db, c));
    addReads(Math.max(1, snap.size));
    out.data[c] = snap.docs.map((d) => ({ id: d.id, ...ser(d.data()) }));
  }
  return out;
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadJson(obj, name) {
  downloadBlob(new Blob([JSON.stringify(obj)], { type: 'application/json' }), name);
}

function flat(row, rupees) {
  const r = {};
  for (const [k, v] of Object.entries(row)) {
    if (v && typeof v === 'object' && '__ts' in v) r[k] = new Date(v.__ts).toISOString();
    else if (v && typeof v === 'object') r[k] = JSON.stringify(v);
    else if (rupees && MONEY_KEYS.has(k) && typeof v === 'number') r[k] = v / 100;
    else r[k] = v;
  }
  return r;
}

/** Excel: one sheet per collection. Money columns shown in rupees (JSON backup keeps paise). */
export async function downloadExcel(backup, name) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const readme = [
    ['Bluvia backup'], ['Exported', backup.exportedAt],
    ['Money columns are in rupees here. Nested columns (lines, jarBalance...) are JSON text, amounts inside them are in paise.'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(readme), 'README');
  for (const [coll, rows] of Object.entries(backup.data)) {
    const ws = XLSX.utils.json_to_sheet(rows.map((r) => flat(r, true)));
    XLSX.utils.book_append_sheet(wb, ws, coll.slice(0, 31));
  }
  XLSX.writeFile(wb, name);
}

export function validateBackup(obj) {
  if (!obj || obj.app !== 'bluvia' || !obj.data) throw new Error('Yeh Bluvia ka backup file nahi lagta.');
  return Object.fromEntries(Object.entries(obj.data).map(([k, rows]) => [k, rows.length]));
}

export async function restoreAll(obj, onProgress = () => {}) {
  let n = 0;
  const entries = [];
  for (const [c, rows] of Object.entries(obj.data)) for (const r of rows) entries.push([c, r]);
  for (let i = 0; i < entries.length; i += 400) {
    const b = writeBatch(db);
    for (const [c, r] of entries.slice(i, i + 400)) {
      const { id, ...rest } = r;
      b.set(doc(db, c, id), deser(rest));
    }
    await b.commit();
    n += Math.min(400, entries.length - i);
    onProgress(n, entries.length);
  }
  return n;
}

export async function markBackupDone() {
  await setDoc(doc(db, 'settings', 'main'), { lastBackupAt: Timestamp.now() }, { merge: true });
}
