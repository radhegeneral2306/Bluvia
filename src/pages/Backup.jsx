import { useState } from 'react';
import { DownloadSimple, FileXls, UploadSimple, Warning, ClockCounterClockwise } from '@phosphor-icons/react';
import { useStore } from '../data/store.jsx';
import { Page, useToast } from '../components/ui.jsx';
import { exportAll, downloadJson, downloadExcel, previewRestore, restoreAll, markBackupDone, confirmHeavyRun } from '../lib/backup.js';
import { getReads } from '../lib/reads.js';
import { dateKeyOf } from '../lib/dates.js';
import { computeRecalc, applyRecalc } from '../lib/recalcDb.js';

export default function Backup() {
  const { settings, online, parties } = useStore();
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const [pending, setPending] = useState(null);
  const last = settings.lastBackupAt?.toDate?.();

  async function doExport(kind) {
    if (!online) return toast('Backup ke liye internet chahiye', 'err');
    if (!confirmHeavyRun('Backup')) return;
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
      let obj;
      try { obj = JSON.parse(await file.text()); } catch { throw new Error('File padh nahi payi. Yeh sahi JSON file nahi hai.'); }
      setBusy('File check ho rahi hai…');
      setPending({ obj, preview: await previewRestore(obj), name: file.name });
    } catch (ex) { toast(ex.message || 'File padh nahi payi', 'err', 6000); } finally { setBusy(''); }
  }
  async function doRestore() {
    if (!window.confirm('PAKKA? Backup ke documents Firestore mein wapas likhe jayenge (same ID wale overwrite honge). Bill number counter kabhi peeche nahi jayega. Jo jar types/items backup mein nahi hain wo inactive ho jayenge. Restore ke baad balances apne aap recalculate honge (bahut reads lagenge).')) return;
    setBusy('Restore ho raha hai…');
    try {
      const { restored: n, deactivated } = await restoreAll(pending.obj, (a, b) => setBusy(`Restore ${a}/${b}…`));
      setBusy('Balances dobara check ho rahe hain…');
      const rc = await computeRecalc();
      if (rc.diffs.length) await applyRecalc(rc);
      toast(`${n} records restore ho gaye; balances theek kiye${deactivated ? `; ${deactivated} purane jar type/item inactive kiye` : ''}`, 'ok', 6000); setPending(null);
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
          <span>Backup poora data padhta hai, isliye bahut reads lagte hain (kam se kam {parties.length} parties ki reads aur saari entries ki, free limit 50,000/din). Aaj is device par: <b className="num">{getReads().toLocaleString('en-IN')}</b> reads. Hafte mein ek baar kaafi hai.</span>
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
        <div className="min-w-0 overflow-hidden">
          <label htmlFor="restore-file" className="sr-only">Backup JSON file chuno</label>
          <input id="restore-file" type="file" accept="application/json,.json" disabled={!!busy} onChange={pickFile} className="block w-full max-w-full min-w-0 text-sm text-slate-600 file:mr-3 file:min-h-[44px] file:rounded-xl file:border file:border-slate-200 file:bg-surface file:px-4 file:font-semibold file:text-slate-800" />
        </div>
        {pending && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900 space-y-2">
            <b>{pending.name}</b>
            <ul className="list-disc ml-5 num">{Object.entries(pending.preview).map(([k, v]) => (
              <li key={k}>{k}: {v.total}{v.overwrite !== undefined ? ` (${v.overwrite} purane overwrite, ${v.isNew} naye)` : ' (purane overwrite ya naye judenge)'}</li>
            ))}</ul>
            <div className="flex gap-2"><button className="btn flex-1" onClick={() => setPending(null)}>Cancel</button><button className="btn btn-danger flex-1" disabled={!!busy} onClick={doRestore}>Restore karo</button></div>
          </div>
        )}
      </section>
    </Page>
  );
}
