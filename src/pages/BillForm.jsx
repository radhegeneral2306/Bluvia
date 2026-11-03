import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useStore } from '../data/store.jsx';
import { createBill, updateTxn, getOne } from '../data/api.js';
import { Page, Field, MoneyInput, QtyInput, StickyBar, Spinner, useToast } from '../components/ui.jsx';
import PartyPicker from '../components/PartyPicker.jsx';
import ShareBillModal from '../components/ShareBillModal.jsx';
import { todayKey } from '../lib/dates.js';
import { lineAmount, billTotals } from '../lib/money.js';
import { rateFor, depositPerJar } from '../lib/rates.js';
import { planChange, negativeJarWarnings } from '../lib/ledger.js';

let seq = 0;
const newLine = () => ({ key: `l${++seq}`, itemId: '', qty: 0, rate: 0, rateTouched: false, jarGiven: true });

export default function BillForm() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const { items, itemMap, jarMap, partyMap, jarName, money } = useStore();
  const [old, setOld] = useState(null);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(null);
  const [depOn, setDepOn] = useState(false);
  const [depAmt, setDepAmt] = useState(0);
  const depTouched = useRef(false);

  useEffect(() => {
    if (f) return;
    (async () => {
      if (id) {
        const t = await getOne('transactions', id);
        if (!t || t.type !== 'bill') return nav('/bills', { replace: true });
        setOld(t);
        setF({
          partyId: t.partyId, dateKey: t.dateKey, discount: t.discount || 0, extraCharge: t.extraCharge || 0, note: t.note || '',
          lines: t.lines.map((l) => ({ key: `l${++seq}`, itemId: l.itemId, qty: l.qty, rate: l.rate, rateTouched: true, jarGiven: l.jarGiven !== false })),
        });
      } else {
        setF({ partyId: sp.get('party') || '', dateKey: todayKey(), discount: 0, extraCharge: 0, note: '', lines: [newLine()] });
      }
    })();
  }, [f, id, sp, nav]);

  const party = f ? partyMap[f.partyId] : null;

  // build the lines exactly as they will be saved
  const built = useMemo(() => {
    if (!f) return [];
    return f.lines.filter((l) => l.itemId && l.qty > 0).map((l) => {
      const it = itemMap[l.itemId];
      return {
        itemId: l.itemId, itemName: it?.name || (old?.lines.find((x) => x.itemId === l.itemId)?.itemName ?? ''),
        jarTypeId: it?.jarTypeId ?? old?.lines.find((x) => x.itemId === l.itemId)?.jarTypeId ?? null,
        qty: l.qty, rate: l.rate, amount: lineAmount(l.qty, l.rate), jarGiven: it?.jarTypeId ? l.jarGiven : false,
      };
    });
  }, [f, itemMap, old]);
  const { subTotal, total } = billTotals(built, f?.discount, f?.extraCharge);

  // suggested deposit for new bills
  const suggestedDep = useMemo(() => {
    let sum = 0; const types = new Set();
    for (const l of built) if (l.jarTypeId && l.jarGiven) { sum += depositPerJar(party, l.jarTypeId, jarMap) * l.qty; types.add(l.jarTypeId); }
    return { sum, type: types.size === 1 ? [...types][0] : null };
  }, [built, party, jarMap]);
  useEffect(() => { if (depOn && !depTouched.current) setDepAmt(suggestedDep.sum); }, [depOn, suggestedDep.sum]);

  if (!f) return <Spinner />;
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const setLine = (key, patch) => setF((p) => ({ ...p, lines: p.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));

  function pickItem(key, itemId) {
    const it = itemMap[itemId];
    setLine(key, { itemId, rate: rateFor(party, it, jarMap), rateTouched: false, jarGiven: true });
  }
  function pickParty(pid) {
    // refill rates only for lines the user has not edited by hand, and only for new bills (old bills keep their snapshot)
    setF((p) => ({
      ...p, partyId: pid,
      lines: old ? p.lines : p.lines.map((l) => (l.itemId && !l.rateTouched ? { ...l, rate: rateFor(partyMap[pid], itemMap[l.itemId], jarMap) } : l)),
    }));
  }

  async function save() {
    if (!f.partyId || !party) return toast('Party chuno', 'err');
    if (!built.length) return toast('Kam se kam ek item aur qty daalo', 'err');
    if (total < 0) return toast('Total negative nahi ho sakta (discount zyada hai)', 'err');
    const bill = {
      type: 'bill', partyId: f.partyId, partyName: party.name, dateKey: f.dateKey, lines: built,
      subTotal, discount: f.discount || 0, extraCharge: f.extraCharge || 0, total, note: f.note || '',
    };
    const warn = negativeJarWarnings(party, planChange(old, { ...bill, id: old?.id }).parties[f.partyId] || { jars: {} });
    if (warn.length && !window.confirm(`Dhyan: ${warn.map((w) => `${jarName(w.jarTypeId)} balance ${w.balance}`).join(', ')} ho jayega. Phir bhi save?`)) return;
    setBusy(true);
    try {
      if (old) {
        const st = await updateTxn(old, bill);
        toast(st === 'queued' ? 'Phone par save hua — internet aate hi sync hoga' : 'Bill update ho gaya', st === 'queued' ? 'warn' : 'ok');
        setSaved({ ...old, ...bill, newOutstanding: (old.prevOutstanding || 0) + total });
      } else {
        const r = await createBill({
          ...bill, depositAmount: depOn ? depAmt : 0, depositJarTypeId: depOn ? suggestedDep.type : null,
        });
        toast(`Bill ${r.billNo} save ho gaya`);
        setSaved({ ...bill, id: r.id, billNo: r.billNo, prevOutstanding: r.prevOutstanding, newOutstanding: r.prevOutstanding + total, jarBalanceAfter: r.jarBalanceAfter, depositCollectedInBill: depOn ? depAmt : 0 });
      }
    } catch (e) {
      toast(e.message || 'Save nahi hua', 'err', 6000);
      setBusy(false);
    }
  }

  const itemOptions = (cur) => items.filter((i) => i.active !== false || i.id === cur);

  return (
    <Page title={old ? `Edit bill ${old.billNo}` : 'New bill'} back>
      <div className="card p-4 space-y-3">
        <Field label="Party"><PartyPicker value={f.partyId} onChange={pickParty} /></Field>
        {party && <div className="text-sm bg-slate-50 rounded-xl p-2">Abhi baaki: <b>{money(party.outstanding || 0)}</b></div>}
        <Field label="Date"><input type="date" className="input" value={f.dateKey} onChange={(e) => set('dateKey', e.target.value || todayKey())} /></Field>
      </div>

      <div className="space-y-3">
        {f.lines.map((l) => {
          const it = itemMap[l.itemId];
          const isJar = !!(it?.jarTypeId);
          return (
            <div key={l.key} className="card p-3 space-y-2">
              <div className="flex gap-2">
                <select className="input" value={l.itemId} onChange={(e) => pickItem(l.key, e.target.value)}>
                  <option value="">Item chuno…</option>
                  {itemOptions(l.itemId).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
                {f.lines.length > 1 && <button className="btn btn-sm !min-h-[48px]" onClick={() => setF({ ...f, lines: f.lines.filter((x) => x.key !== l.key) })}>🗑</button>}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 items-end">
                <Field label={`Qty${it?.unit ? ` (${it.unit})` : ''}`}><QtyInput integer={isJar} value={l.qty} onChange={(v) => setLine(l.key, { qty: v })} /></Field>
                <Field label="Rate"><MoneyInput value={l.rate} onChange={(v) => setLine(l.key, { rate: v, rateTouched: true })} /></Field>
                <div className="text-right pb-3 col-span-2 sm:col-span-1"><div className="label">Amount</div><b>{money(lineAmount(l.qty, l.rate))}</b></div>
              </div>
              {isJar && (
                <label className="flex items-center gap-3 min-h-[40px] text-sm">
                  <input type="checkbox" className="w-5 h-5" checked={l.jarGiven} onChange={(e) => setLine(l.key, { jarGiven: e.target.checked })} />
                  Jar diya ({jarName(it.jarTypeId)}) — party ke jar count mein judega
                </label>
              )}
            </div>
          );
        })}
        <button className="btn w-full" onClick={() => setF({ ...f, lines: [...f.lines, newLine()] })}>+ Item add karo</button>
      </div>

      <div className="card p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Discount"><MoneyInput value={f.discount} onChange={(v) => set('discount', v)} /></Field>
          <Field label="Extra charge"><MoneyInput value={f.extraCharge} onChange={(v) => set('extraCharge', v)} /></Field>
        </div>
        <Field label="Note"><input className="input" value={f.note} onChange={(e) => set('note', e.target.value)} /></Field>
        {!old && (
          <div className="rounded-xl border border-slate-200 p-3 space-y-2">
            <label className="flex items-center gap-3 min-h-[40px]">
              <input type="checkbox" className="w-5 h-5" checked={depOn} onChange={(e) => setDepOn(e.target.checked)} />
              <span className="font-medium">Deposit bhi liya (alag entry banegi)</span>
            </label>
            {depOn && (
              <>
                <Field label="Deposit amount" hint="Deposit bill total ya sales mein nahi judta."><MoneyInput value={depAmt} onChange={(v) => { depTouched.current = true; setDepAmt(v); }} /></Field>
              </>
            )}
          </div>
        )}
        {old && <p className="text-xs text-slate-500">Deposit ki entry ko Party → Deposit se alag edit karo.</p>}
        <div className="flex justify-between text-sm"><span>Sub total</span><span>{money(subTotal)}</span></div>
        <div className="flex justify-between text-xl font-bold"><span>Total</span><span>{money(total)}</span></div>
        {party && <div className="text-xs text-slate-500">Naya baaki (bill ke baad): {money((old ? old.prevOutstanding || 0 : party.outstanding || 0) + total)}</div>}
      </div>

      <StickyBar>
        <button className="btn flex-1" onClick={() => nav(-1)}>Cancel</button>
        <button className="btn btn-primary flex-[2]" disabled={busy} onClick={save}>{busy ? 'Saving…' : `Save • ${money(total)}`}</button>
      </StickyBar>
      <ShareBillModal bill={saved} onClose={() => nav(`/party/${f.partyId}`, { replace: true })} />
    </Page>
  );
}
