import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../data/store.jsx';
import { createParty, updateParty } from '../data/api.js';
import { Page, Field, MoneyInput, QtyInput, StickyBar, useToast } from '../components/ui.jsx';

const blank = {
  name: '', phone: '', address: '', notes: '', active: true,
  openingBalance: 0, openingJars: {}, openingDeposit: 0, jarRates: {}, itemRates: {},
};

export default function PartyForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { partyMap, jarTypes, items, money } = useStore();
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const old = id ? partyMap[id] : null;

  useEffect(() => { if (!f) { if (!id) setF(blank); else if (old) setF({ ...blank, ...old }); } }, [id, old, f]);
  if (!f) return null;
  const set = (k, v) => setF({ ...f, [k]: v });
  const setJar = (jid, k, v) => set('jarRates', { ...f.jarRates, [jid]: { ...(f.jarRates[jid] || {}), [k]: v } });
  const setItemRate = (iid, v) => { const r = { ...f.itemRates }; if (v) r[iid] = v; else delete r[iid]; set('itemRates', r); };

  async function save() {
    if (!f.name.trim()) return toast('Party ka naam likho', 'err');
    setBusy(true);
    try {
      const jarRates = {};
      for (const [j, v] of Object.entries(f.jarRates)) if (v.rate || v.deposit) jarRates[j] = { rate: v.rate || 0, deposit: v.deposit || 0 };
      const openingJars = {};
      for (const [j, n] of Object.entries(f.openingJars || {})) if (n) openingJars[j] = n;
      const data = {
        name: f.name.trim(), phone: (f.phone || '').trim(), address: f.address || '', notes: f.notes || '', active: f.active !== false,
        openingBalance: f.openingBalance || 0, openingJars, openingDeposit: f.openingDeposit || 0, jarRates, itemRates: f.itemRates || {},
      };
      if (id) { await updateParty(id, old, data); nav(`/party/${id}`, { replace: true }); }
      else { const nid = await createParty(data); nav(`/party/${nid}`, { replace: true }); }
      toast('Party save ho gayi');
    } catch (e) { toast(e.message, 'err'); setBusy(false); }
  }

  const activeJars = jarTypes.filter((j) => j.active !== false || f.jarRates[j.id] || (f.openingJars || {})[j.id]);
  const nonJarItems = items.filter((i) => !i.jarTypeId && i.active !== false);

  return (
    <Page title={id ? 'Edit party' : 'New party'} back>
      <div className="card p-4 space-y-3">
        <Field label="Name *"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Phone"><input className="input" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Address"><textarea className="input !py-2" rows={2} value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
        <Field label="Notes"><input className="input" value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        <label className="flex items-center gap-3 min-h-[48px] font-medium"><input type="checkbox" className="w-5 h-5" checked={f.active !== false} onChange={(e) => set('active', e.target.checked)} /> Active</label>
      </div>

      <div className="card p-4 space-y-3">
        <h2 className="font-semibold">Opening balance</h2>
        <p className="text-xs text-slate-500">Purana hisaab jo is app mein aane se pehle ka hai. Baad mein badloge to sirf difference balance mein judega.</p>
        <Field label={`Baaki paisa (${money(0).replace('0', '')})`}><MoneyInput value={f.openingBalance} onChange={(v) => set('openingBalance', v)} /></Field>
        <Field label="Deposit jo hamare paas hai"><MoneyInput value={f.openingDeposit} onChange={(v) => set('openingDeposit', v)} /></Field>
        {activeJars.map((j) => (
          <Field key={j.id} label={`Jars out — ${j.name}`}>
            <QtyInput value={(f.openingJars || {})[j.id] || 0} onChange={(n) => set('openingJars', { ...f.openingJars, [j.id]: n })} />
          </Field>
        ))}
      </div>

      <div className="card p-4 space-y-3">
        <h2 className="font-semibold">Party ke special rates (optional)</h2>
        <p className="text-xs text-slate-500">Khali chhodo to default rate / deposit lagega.</p>
        {activeJars.map((j) => (
          <div key={j.id} className="rounded-xl bg-slate-50 p-3 space-y-2">
            <div className="font-semibold text-sm">{j.name} <span className="text-slate-500 font-normal">(default {money(j.defaultRate || 0)}, dep {money(j.defaultDeposit || 0)})</span></div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Rate"><MoneyInput value={f.jarRates[j.id]?.rate || 0} onChange={(v) => setJar(j.id, 'rate', v)} /></Field>
              <Field label="Deposit"><MoneyInput value={f.jarRates[j.id]?.deposit || 0} onChange={(v) => setJar(j.id, 'deposit', v)} /></Field>
            </div>
          </div>
        ))}
        {nonJarItems.map((i) => (
          <Field key={i.id} label={`${i.name} rate (default ${money(i.defaultRate || 0)})`}>
            <MoneyInput value={f.itemRates?.[i.id] || 0} onChange={(v) => setItemRate(i.id, v)} />
          </Field>
        ))}
      </div>
      <StickyBar>
        <button className="btn flex-1" onClick={() => nav(-1)}>Cancel</button>
        <button className="btn btn-primary flex-[2]" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save party'}</button>
      </StickyBar>
    </Page>
  );
}
