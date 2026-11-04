import { useState } from 'react';
import { useStore } from '../data/store.jsx';
import { Page, Badge, useToast } from '../components/ui.jsx';
import { computeRecalc, applyRecalc } from '../lib/recalcDb.js';

export default function Recalc() {
  const { money, jarName, online } = useStore();
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const [res, setRes] = useState(null);

  async function run() {
    if (!online) return toast('Internet chahiye', 'err');
    if (!window.confirm('Yeh saari parties aur saari entries padhega (bahut reads). Aage badhein?')) return;
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
      <div className="card p-4 space-y-3">
        <p className="text-sm">Yeh tool saari entries se har party ka baaki, jars aur deposit dobara nikaalta hai, aur stored numbers se compare karke difference dikhata hai. <b>Pehle sirf dikhata hai — aap "Apply" dabaoge tabhi badlega.</b></p>
        <p className="text-xs text-amber-700">⚠️ Isme saari parties + saari transactions padhi jaati hain. Free plan mein din ke 50,000 reads hi milte hain, isliye roz mat chalao.</p>
        <button className="btn btn-primary w-full" disabled={!!busy} onClick={run}>🧮 Check karo</button>
        {busy && <p className="text-sm text-slate-600">{busy}</p>}
      </div>
      {res && (
        <div className="card p-4 space-y-3">
          <p className="text-sm">{res.parties.length} parties, {res.txnCount} entries check hui.</p>
          {res.calc.orphans.length > 0 && <p className="text-sm text-amber-700">{res.calc.orphans.length} entries aisi mili jinki party exist nahi karti.</p>}
          {!res.diffs.length ? <Badge tone="green">Sab theek hai — koi difference nahi ✓</Badge> : (
            <>
              <Badge tone="red">{res.diffs.length} difference mile</Badge>
              <div className="overflow-x-auto"><table className="w-full text-xs">
                <thead><tr className="text-left text-slate-500"><th className="py-1">Kahan</th><th>Field</th><th className="text-right">Stored</th><th className="text-right">Sahi</th></tr></thead>
                <tbody>{res.diffs.map((d, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="py-1">{d.scope === 'party' ? d.name : d.scope === 'daily' ? d.id : 'Summary'}</td><td>{label(d)}</td>
                    <td className="text-right">{fmt(d.field, d.stored)}</td><td className="text-right font-semibold">{fmt(d.field, d.calculated)}</td>
                  </tr>))}</tbody>
              </table></div>
              <button className="btn btn-danger w-full" disabled={!!busy} onClick={apply}>Apply — sahi values likh do</button>
            </>
          )}
        </div>
      )}
    </Page>
  );
}
