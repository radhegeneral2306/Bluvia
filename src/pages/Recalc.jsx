import { useState } from 'react';
import { Calculator, Warning, CheckCircle } from '@phosphor-icons/react';
import { useStore } from '../data/store.jsx';
import { Page, Badge, useToast } from '../components/ui.jsx';
import { computeRecalc, applyRecalc } from '../lib/recalcDb.js';
import { confirmHeavyRun } from '../lib/backup.js';

export default function Recalc() {
  const { money, jarName, online } = useStore();
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const [res, setRes] = useState(null);

  async function run() {
    if (!online) return toast('Internet chahiye', 'err');
    if (!window.confirm('Yeh saari parties aur saari entries padhega (bahut reads). Aage badhein?')) return;
    if (!confirmHeavyRun('Recalculate')) return;
    setBusy('Padh raha hai…');
    try { setRes(await computeRecalc((c) => setBusy(`${c} padh raha hai…`))); }
    catch (e) { toast(e.message, 'err', 6000); } finally { setBusy(''); }
  }
  async function apply() {
    if (!window.confirm('Difference wali values ko sahi values se replace karna hai?')) return;
    setBusy('Apply ho raha hai…');
    try { const n = await applyRecalc(res); toast(`${n} documents update hue`); setRes(null); }
    catch (e) { toast(e.message, 'err', 6000); } finally { setBusy(''); }
  }
  const fmt = (field, v) => (field.startsWith('jarBalance') || field.startsWith('totalJarsOut') || field === 'billsCount' ? v : money(v));
  const label = (d) => {
    const [a, b] = d.field.split('.');
    return b ? `${a} (${jarName(b)})` : a;
  };

  return (
    <Page title="Recalculate balances" back="/more">
      <section className="card p-4 space-y-4">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center shrink-0"><Calculator size={20} /></span>
          <p className="text-sm text-slate-700">Yeh tool saari entries se har party ka baaki, jars aur deposit dobara nikaalta hai, aur stored numbers se compare karke difference dikhata hai. <b>Pehle sirf dikhata hai. Aap "Apply" dabaoge tabhi badlega.</b></p>
        </div>
        <p className="flex gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <Warning size={20} weight="fill" className="shrink-0 mt-px" />
          <span>Isme saari parties + saari transactions padhi jaati hain. Free plan mein din ke 50,000 reads hi milte hain, isliye roz mat chalao.</span>
        </p>
        <button className="btn btn-primary w-full" disabled={!!busy} onClick={run}><Calculator size={20} />Check karo</button>
        {busy && <p className="text-sm text-slate-600" role="status">{busy}</p>}
      </section>
      {res && (
        <section className="card p-4 space-y-3 page-enter">
          <p className="text-sm text-slate-600 num">{res.parties.length} parties, {res.txnCount} entries check hui.</p>
          {res.calc.orphans.length > 0 && <p className="flex gap-2 text-sm text-amber-800"><Warning size={18} weight="fill" className="shrink-0 mt-px" />{res.calc.orphans.length} entries aisi mili jinki party exist nahi karti.</p>}
          {!res.diffs.length ? <div className="flex items-center gap-2 text-emerald-700 font-semibold"><CheckCircle size={22} weight="fill" /><Badge tone="green">Sab theek hai, koi difference nahi</Badge></div> : (
            <>
              <Badge tone="red">{res.diffs.length} difference mile</Badge>
              <div className="overflow-x-auto -mx-1"><table className="w-full text-xs num">
                <thead><tr className="text-left text-slate-500 bg-slate-100"><th className="py-2 px-2 font-semibold">Kahan</th><th className="px-2 font-semibold">Field</th><th className="text-right px-2 font-semibold">Stored</th><th className="text-right px-2 font-semibold">Sahi</th></tr></thead>
                <tbody>{res.diffs.map((d, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="py-2 px-2">{d.scope === 'party' ? d.name : d.scope === 'daily' ? d.id : 'Summary'}</td><td className="px-2">{label(d)}</td>
                    <td className="text-right px-2 text-slate-500">{fmt(d.field, d.stored)}</td><td className="text-right px-2 font-semibold text-slate-900">{fmt(d.field, d.calculated)}</td>
                  </tr>))}</tbody>
              </table></div>
              <button className="btn btn-danger w-full" disabled={!!busy} onClick={apply}>Apply: sahi values likh do</button>
            </>
          )}
        </section>
      )}
    </Page>
  );
}
