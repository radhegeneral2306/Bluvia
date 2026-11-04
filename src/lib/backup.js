import { collection, doc, getDoc, getDocs, writeBatch, Timestamp, setDoc } from 'firebase/firestore';
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

export const RESTORE_COLLECTIONS = ['settings', 'jarTypes', 'items', 'parties', 'transactions', 'stats'];
const CHUNK = 400;

/** Checks the shape of a backup file. Returns { collection: rowCount } or throws a clear Hinglish error. */
export function validateBackup(obj) {
  if (!obj || typeof obj !== 'object' || obj.app !== 'bluvia' || !obj.data || typeof obj.data !== 'object' || Array.isArray(obj.data)) {
    throw new Error('Yeh Bluvia ka backup file nahi lagta.');
  }
  const counts = {};
  for (const [k, rows] of Object.entries(obj.data)) {
    if (!RESTORE_COLLECTIONS.includes(k)) throw new Error(`Backup mein anjaan section "${k}" hai, isliye restore nahi ho sakta.`);
    if (!Array.isArray(rows)) throw new Error(`Backup file kharab hai: "${k}" ek list nahi hai.`);
    rows.forEach((r, i) => {
      if (!r || typeof r !== 'object' || Array.isArray(r) || typeof r.id !== 'string' || !r.id || r.id.includes('/')) {
        throw new Error(`Backup file kharab hai: ${k} ki entry number ${i + 1} mein sahi id nahi hai.`);
      }
    });
    counts[k] = rows.length;
  }
  return counts;
}

/** Cheap preview: for the small collections (settings, jarTypes, items) say how many will overwrite vs are new. */
export async function previewRestore(obj) {
  const counts = validateBackup(obj);
  const out = {};
  for (const [k, total] of Object.entries(counts)) {
    out[k] = { total };
    if (k === 'settings') {
      const cur = await getDoc(doc(db, 'settings', 'main')); addReads(1);
      const has = obj.data.settings.some((r) => r.id === 'main');
      out[k].overwrite = has && cur.exists() ? 1 : 0; out[k].isNew = total - out[k].overwrite;
    } else if (k === 'jarTypes' || k === 'items') {
      const snap = await getDocs(collection(db, k)); addReads(Math.max(1, snap.size));
      const have = new Set(snap.docs.map((d) => d.id));
      out[k].overwrite = obj.data[k].filter((r) => have.has(r.id)).length; out[k].isNew = total - out[k].overwrite;
    }
  }
  return out;
}

/**
 * Writes the backup back in chunks of 400. Rules:
 *  - bill number counter (settings/main.nextBillNo) is never lowered,
 *  - jar types / items that exist now but are not in the backup (e.g. freshly seeded defaults) are deactivated, not deleted.
 * Returns { restored, deactivated }. A failing chunk is named in the error.
 */
export async function restoreAll(obj, onProgress = () => {}) {
  validateBackup(obj);
  const data = JSON.parse(JSON.stringify(obj.data)); // never mutate the caller's object
  const curSettings = await getDoc(doc(db, 'settings', 'main')); addReads(1);
  const curNext = curSettings.exists() ? curSettings.data().nextBillNo : null;
  for (const r of data.settings || []) {
    if (r.id === 'main' && typeof curNext === 'number' && curNext > (r.nextBillNo || 0)) r.nextBillNo = curNext;
  }

  const entries = [];
  for (const c of RESTORE_COLLECTIONS) for (const r of data[c] || []) entries.push([c, r]);
  const chunks = Math.ceil(entries.length / CHUNK);
  let n = 0;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const no = i / CHUNK + 1;
    try {
      const b = writeBatch(db);
      for (const [c, r] of entries.slice(i, i + CHUNK)) {
        const { id, ...rest } = r;
        b.set(doc(db, c, id), deser(rest));
      }
      await b.commit();
    } catch (e) {
      throw new Error(`Restore ka hissa ${no}/${chunks} fail hua (${n} records pehle ho chuke the, baaki nahi hue): ${e.message}`);
    }
    n += Math.min(CHUNK, entries.length - i);
    onProgress(n, entries.length);
  }

  let deactivated = 0;
  for (const c of ['jarTypes', 'items']) {
    if (!Array.isArray(data[c])) continue;
    const keep = new Set(data[c].map((r) => r.id));
    const snap = await getDocs(collection(db, c)); addReads(Math.max(1, snap.size));
    const stale = snap.docs.filter((d) => !keep.has(d.id) && d.data().active !== false);
    if (!stale.length) continue;
    const b = writeBatch(db);
    stale.forEach((d) => b.set(doc(db, c, d.id), { active: false }, { merge: true }));
    await b.commit();
    deactivated += stale.length;
  }
  return { restored: n, deactivated };
}

export async function markBackupDone() {
  await setDoc(doc(db, 'settings', 'main'), { lastBackupAt: Timestamp.now() }, { merge: true });
}

const HEAVY_KEY = 'bluvia_heavy_run_at';
/** Backup / recalculate read the whole database. Asks for confirmation if one ran in the last 12 hours. */
export function confirmHeavyRun(what = 'Yeh kaam') {
  let last = 0;
  try { last = Number(localStorage.getItem(HEAVY_KEY)) || 0; } catch { /* ignore */ }
  const hours = (Date.now() - last) / 3600000;
  if (last && hours < 12) {
    const ok = window.confirm(`${what} pichhle ${Math.max(1, Math.round(hours))} ghante mein ek baar chala tha. Dobara chalane se free limit ki bahut saari reads lagengi. Phir bhi chalana hai?`);
    if (!ok) return false;
  }
  try { localStorage.setItem(HEAVY_KEY, String(Date.now())); } catch { /* ignore */ }
  return true;
}
