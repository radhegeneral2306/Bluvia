import { useState } from 'react';
import { DownloadSimple, FileXls, UploadSimple, Warning, ClockCounterClockwise } from '@phosphor-icons/react';
import { useStore } from '../data/store.jsx';
import { Page, useToast } from '../components/ui.jsx';
import { exportAll, downloadJson, downloadExcel, validateBackup, restoreAll, markBackupDone } from '../lib/backup.js';
import { dateKeyOf } from '../lib/dates.js';
import { computeRecalc, applyRecalc } from '../lib/recalcDb.js';

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
      toast('Backup ban gaya, file download folder mein dekho');
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
    if (!window.confirm('PAKKA? Backup ke documents Firestore mein wapas likhe jayenge (same ID wale overwrite honge). Bill number counter bhi backup wala ho jayega. Restore ke baad balances apne aap recalculate honge (reads lagenge).')) return;
    setBusy('Restore ho raha hai…');
    try {
      const n = await restoreAll(pending.obj, (a, b) => setBusy(`Restore ${a}/${b}…`));
      setBusy('Balances dobara check ho rahe hain…');
      const rc = await computeRecalc();
      if (rc.diffs.length) await applyRecalc(rc);
      toast(`${n} records restore ho gaye; balances theek kiye`); setPending(null);
    } catch (e) { toast(`Restore fail: ${e.message}`, 'err', 8000); } finally { setBusy(''); }
  }

  return (
    <Page title="Backup & Restore" back="/more">
      <section className="card p-4 space-y-4">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center shrink-0"><ClockCounterClockwise size={20} /></span>
          <div>
            <div className="text-xs text-slate-500">Last backup</div>
            <div className="font-semibold num">{last ? last.toLocaleString('en-IN') : 'Kabhi nahi'}</div>
          </div>
        </div>
        <p className="flex gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <Warning size={20} weight="fill" className="shrink-0 mt-px" />
          <span>Backup poora data padhta hai. Jitni zyada entries, utni zyada Firestore reads (free limit 50,000/din). Hafte mein ek baar kaafi hai.</span>
        </p>
        <div className="grid gap-2">
          <button className="btn btn-primary w-full" disabled={!!busy} onClick={() => doExport('json')}><DownloadSimple size={20} />Full backup (JSON)</button>
          <button className="btn w-full" disabled={!!busy} onClick={() => doExport('excel')}><FileXls size={20} />Excel export (har collection ki alag sheet)</button>
        </div>
        {busy && <p className="text-sm text-slate-600" role="status">{busy}</p>}
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><UploadSimple size={20} />Restore (JSON se)</h2>
        <p className="text-xs text-slate-500">Sirf Bluvia ki apni JSON backup file chunna. Restore purane documents ko overwrite karta hai; jo documents backup mein nahi hain wo delete nahi hote.</p>
        <input type="file" accept="application/json,.json" onChange={pickFile} className="block w-full text-sm text-slate-600 file:mr-3 file:min-h-[44px] file:rounded-xl file:border file:border-slate-200 file:bg-surface file:px-4 file:font-semibold file:text-slate-800" />
        {pending && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900 space-y-2">
            <b>{pending.name}</b>
            <ul className="list-disc ml-5 num">{Object.entries(pending.counts).map(([k, v]) => <li key={k}>{k}: {v}</li>)}</ul>
            <div className="flex gap-2"><button className="btn flex-1" onClick={() => setPending(null)}>Cancel</button><button className="btn btn-danger flex-1" disabled={!!busy} onClick={doRestore}>Restore karo</button></div>
          </div>
        )}
      </section>
    </Page>
  );
}
