import { useState } from 'react';
import { useStore } from '../data/store.jsx';
import { Page, useToast } from '../components/ui.jsx';
import { exportAll, downloadJson, downloadExcel, validateBackup, restoreAll, markBackupDone } from '../lib/backup.js';
import { dateKeyOf } from '../lib/dates.js';

export default function Backup() {
  const { settings, online } = useStore();
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const [pending, setPending] = useState(null);
  const last = settings.lastBackupAt?.toDate?.();

  async function doExport(kind) {
    if (!online) return toast('Backup ke liye internet chahiye', 'err');
    setBusy(`${kind} bana raha hai…`);
    try {
      const data = await exportAll((c) => setBusy(`${c} padh raha hai…`));
      const stamp = dateKeyOf();
      if (kind === 'json') downloadJson(data, `bluvia-backup-${stamp}.json`);
      else await downloadExcel(data, `bluvia-backup-${stamp}.xlsx`);
      await markBackupDone();
      toast('Backup ban gaya — file download folder mein dekho');
    } catch (e) { toast(`Backup fail: ${e.message}`, 'err', 6000); } finally { setBusy(''); }
  }
  async function pickFile(e) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    try {
      const obj = JSON.parse(await file.text());
      setPending({ obj, counts: validateBackup(obj), name: file.name });
    } catch (ex) { toast(ex.message || 'File padh nahi payi', 'err'); }
  }
  async function doRestore() {
    if (!window.confirm('PAKKA? Backup ke documents Firestore mein wapas likhe jayenge (same ID wale overwrite honge). Iske baad "Recalculate balances" chalana behtar hai.')) return;
    setBusy('Restore ho raha hai…');
    try {
      const n = await restoreAll(pending.obj, (a, b) => setBusy(`Restore ${a}/${b}…`));
      toast(`${n} records restore ho gaye`); setPending(null);
    } catch (e) { toast(`Restore fail: ${e.message}`, 'err', 8000); } finally { setBusy(''); }
  }

  return (
    <Page title="Backup & Restore" back="/more">
      <div className="card p-4 space-y-3">
        <p className="text-sm">Last backup: <b>{last ? last.toLocaleString('en-IN') : 'Kabhi nahi'}</b></p>
        <p className="text-xs text-amber-700">Backup poora data padhta hai — jitni zyada entries, utni zyada Firestore reads (free limit 50,000/din). Hafte mein ek baar kaafi hai.</p>
        <button className="btn btn-primary w-full" disabled={!!busy} onClick={() => doExport('json')}>💾 Full backup (JSON)</button>
        <button className="btn w-full" disabled={!!busy} onClick={() => doExport('excel')}>📊 Excel export (har collection ki alag sheet)</button>
        {busy && <p className="text-sm text-slate-600">{busy}</p>}
      </div>
      <div className="card p-4 space-y-3">
        <h2 className="font-bold">Restore (JSON se)</h2>
        <p className="text-xs text-slate-500">Sirf Bluvia ki apni JSON backup file chunna. Restore purane documents ko overwrite karta hai; jo documents backup mein nahi hain wo delete nahi hote.</p>
        <input type="file" accept="application/json,.json" onChange={pickFile} className="block w-full text-sm" />
        {pending && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm space-y-2">
            <b>{pending.name}</b>
            <ul className="list-disc ml-5">{Object.entries(pending.counts).map(([k, v]) => <li key={k}>{k}: {v}</li>)}</ul>
            <div className="flex gap-2"><button className="btn flex-1" onClick={() => setPending(null)}>Cancel</button><button className="btn btn-danger flex-1" disabled={!!busy} onClick={doRestore}>Restore karo</button></div>
          </div>
        )}
      </div>
    </Page>
  );
}
