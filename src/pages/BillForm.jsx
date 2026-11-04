import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Trash, Plus } from '@phosphor-icons/react';
import { useStore } from '../data/store.jsx';
import { createBill, updateTxn, getOne } from '../data/api.js';
import { Page, Field, MoneyInput, QtyInput, StickyBar, Spinner, useToast } from '../components/ui.jsx';
import PartyPicker from '../components/PartyPicker.jsx';
import ShareBillModal from '../components/ShareBillModal.jsx';
import { todayKey } from '../lib/dates.js';
import { lineAmount, billTotals } from '../lib/money.js';
import { rateFor, depositPerJar } from '../lib/rates.js';
import { planChange, negativeJarWarnings } from '../lib/ledger.js';

function Switch({ checked, onChange, children }) {
  return (
    <label className="flex items-center gap-3 min-h-[44px] cursor-pointer text-sm">
      <span className="relative inline-flex shrink-0">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={onChange} />
        <span className="w-11 h-6 rounded-full bg-slate-300 transition-colors peer-checked:bg-brand-600 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40" />
        <span className="absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-surface shadow-sm transition-transform peer-checked:translate-x-5" />
      </span>
      <span className="text-slate-700">{children}</span>
    </label>
  );
}

let seq = 0;
const newLine = () => ({ key: `l${++seq}`, itemId: '', qty: 0, rate: 0, rateTouched: false, jarGiven: true });

export default function BillForm() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const { items, itemMap, jarMap, jarTypes, partyMap, jarName, money, settings } = useStore();
  const [old, setOld] = useState(null);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(null);
  const [depOn, setDepOn] = useState(false);
  const [depAmt, setDepAmt] = useState(0);
  const [returns, setReturns] = useState({});
  const depTouched = useRef(false);

  useEffect(() => {
    if (f) return;
    (async () => {
      if (id) {
        const t = await getOne('transactions', id);
        if (!t || t.type !== 'bill') return nav('/bills', { replace: true });
        setOld(t);
        setF({
          partyId: t.partyId, dateKey: t.dateKey, forText: t.forText ?? '', discount: t.discount || 0, extraCharge: t.extraCharge || 0, note: t.note || '',
          lines: t.lines.map((l) => ({ key: `l${++seq}`, itemId: l.itemId, qty: l.qty, rate: l.rate, rateTouched: true, jarGiven: l.jarGiven !== false })),
        });
      } else {
        setF({ partyId: sp.get('party') || '', dateKey: todayKey(), forText: settings.invoiceFor || '', discount: 0, extraCharge: 0, note: '', lines: [newLine()] });
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
      subTotal, discount: f.discount || 0, extraCharge: f.extraCharge || 0, total, note: f.note || '', forText: f.forText || '',
    };
    const warn = negativeJarWarnings(party, planChange(old, { ...bill, id: old?.id }).parties[f.partyId] || { jars: {} });
    if (warn.length && !window.confirm(`Dhyan: ${warn.map((w) => `${jarName(w.jarTypeId)} balance ${w.balance}`).join(', ')} ho jayega. Phir bhi save?`)) return;
    setBusy(true);
    try {
      if (old) {
        const st = await updateTxn(old, bill);
        toast(st === 'queued' ? 'Phone par save hua. Internet aate hi sync hoga' : 'Bill update ho gaya', st === 'queued' ? 'warn' : 'ok');
        setSaved({ ...old, ...bill, newOutstanding: (old.prevOutstanding || 0) + total });
      } else {
        const r = await createBill({
          ...bill, depositAmount: depOn ? depAmt : 0, depositJarTypeId: depOn ? suggestedDep.type : null,
          returns: Object.fromEntries(Object.entries(returns).filter(([, n]) => n > 0)),
        });
        toast(`Bill ${r.billNo} save ho gaya`);
        setSaved({ ...bill, id: r.id, billNo: r.billNo, prevOutstanding: r.prevOutstanding, newOutstanding: r.prevOutstanding + total, jarBalanceAfter: r.jarBalanceAfter, depositCollectedInBill: depOn ? depAmt : 0, returnedInBill: Object.fromEntries(Object.entries(returns).filter(([, n]) => n > 0)) });
      }
    } catch (e) {
      toast(e.message || 'Save nahi hua', 'err', 6000);
      setBusy(false);
    }
  }

  const itemOptions = (cur) => items.filter((i) => i.active !== false || i.id === cur);

  const newDue = party ? (old ? old.prevOutstanding || 0 : party.outstanding || 0) + total : 0;
  return (
    <Page title={old ? `Edit bill ${old.billNo}` : 'New bill'} back>
      <section className="space-y-3">
        <Field label="Party"><PartyPicker value={f.partyId} onChange={pickParty} /></Field>
        {party && (
          <div className="flex items-center justify-between text-sm px-1">
            <span className="text-slate-500">Abhi baaki</span>
            <span className={`num font-semibold ${(party.outstanding || 0) > 0 ? 'text-red-600' : 'text-slate-800'}`}>{money(party.outstanding || 0)}</span>
          </div>
        )}
        <Field label="Date"><input type="date" className="input num" value={f.dateKey} onChange={(e) => set('dateKey', e.target.value || todayKey())} /></Field>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-500 px-1">Items</h2>
        {f.lines.map((l) => {
          const it = itemMap[l.itemId];
          const isJar = !!(it?.jarTypeId);
          return (
            <div key={l.key} className="card p-3.5 space-y-3">
              <div className="flex gap-2">
                <select className="input" aria-label="Item" value={l.itemId} onChange={(e) => pickItem(l.key, e.target.value)}>
                  <option value="">Item chuno…</option>
                  {itemOptions(l.itemId).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
                {f.lines.length > 1 && (
                  <button className="btn btn-ghost !min-h-[48px] !w-12 !px-0 text-slate-500" aria-label="Item hatao" onClick={() => setF({ ...f, lines: f.lines.filter((x) => x.key !== l.key) })}>
                    <Trash size={20} />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 items-end">
                <Field label={`Qty${it?.unit ? ` (${it.unit})` : ''}`}><QtyInput integer={isJar} value={l.qty} onChange={(v) => setLine(l.key, { qty: v })} /></Field>
                <Field label="Rate"><MoneyInput value={l.rate} onChange={(v) => setLine(l.key, { rate: v, rateTouched: true })} /></Field>
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-2.5">
                <span className="text-sm text-slate-500">Amount</span>
                <span className="num font-semibold text-slate-900">{money(lineAmount(l.qty, l.rate))}</span>
              </div>
              {isJar && (
                <Switch checked={l.jarGiven} onChange={(e) => setLine(l.key, { jarGiven: e.target.checked })}>
                  Jar diya ({jarName(it.jarTypeId)}), party ke jar count mein judega
                </Switch>
              )}
            </div>
          );
        })}
        <button className="btn w-full border-dashed text-brand-700" onClick={() => setF({ ...f, lines: [...f.lines, newLine()] })}>
          <Plus size={20} weight="bold" />Item add karo
        </button>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-500 px-1">Charges aur details</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Discount"><MoneyInput value={f.discount} onChange={(v) => set('discount', v)} /></Field>
          <Field label="Extra charge"><MoneyInput value={f.extraCharge} onChange={(v) => set('extraCharge', v)} /></Field>
        </div>
        <Field label="Invoice 'FOR' text" hint="PDF invoice mein FOR: ke neeche dikhega"><input className="input" value={f.forText} onChange={(e) => set('forText', e.target.value)} /></Field>
        <Field label="Note"><input className="input" value={f.note} onChange={(e) => set('note', e.target.value)} /></Field>
      </section>

      {!old && jarTypes.some((j) => j.active !== false) && (
        <section className="card p-4 space-y-3">
          <div className="text-sm font-semibold text-slate-800">Khali jar wapas liye</div>
          <p className="text-xs text-slate-500 -mt-2">Optional. Alag Jar Return entry banegi.</p>
          <div className="grid grid-cols-2 gap-3">
            {jarTypes.filter((j) => j.active !== false).map((j) => (
              <Field key={j.id} label={j.name}><QtyInput value={returns[j.id] || 0} onChange={(n) => setReturns((r) => ({ ...r, [j.id]: n }))} /></Field>
            ))}
          </div>
        </section>
      )}
      {!old && (
        <section className="card p-4 space-y-2">
          <Switch checked={depOn} onChange={(e) => setDepOn(e.target.checked)}>
            <span className="font-semibold text-slate-800">Deposit bhi liya</span> (alag entry banegi)
          </Switch>
          {depOn && (
            <Field label="Deposit amount" hint="Deposit bill total ya sales mein nahi judta."><MoneyInput value={depAmt} onChange={(v) => { depTouched.current = true; setDepAmt(v); }} /></Field>
          )}
        </section>
      )}
      {old && <p className="text-xs text-slate-500 px-1">Deposit ki entry ko Party → Deposit se alag edit karo.</p>}

      <section className="border-t border-slate-200 pt-4 space-y-1.5">
        <div className="flex justify-between text-sm text-slate-600"><span>Sub total</span><span className="num">{money(subTotal)}</span></div>
        {!!f.discount && <div className="flex justify-between text-sm text-slate-600"><span>Discount</span><span className="num">-{money(f.discount)}</span></div>}
        {!!f.extraCharge && <div className="flex justify-between text-sm text-slate-600"><span>Extra charge</span><span className="num">{money(f.extraCharge)}</span></div>}
        <div className="flex justify-between items-baseline pt-1">
          <span className="font-semibold text-slate-800">Total</span>
          <span className="num text-[28px] leading-8 font-semibold text-slate-900">{money(total)}</span>
        </div>
        {party && (
          <div className="flex justify-between text-sm pt-1">
            <span className="text-slate-500">Naya baaki (bill ke baad)</span>
            <span className={`num font-semibold ${newDue > 0 ? 'text-red-600' : 'text-slate-800'}`}>{money(newDue)}</span>
          </div>
        )}
      </section>

      <StickyBar>
        <button className="btn flex-1" onClick={() => nav(-1)}>Cancel</button>
        <button className="btn btn-primary flex-[2]" disabled={busy} onClick={save}>{busy ? 'Saving…' : `Save ${money(total)}`}</button>
      </StickyBar>
      <ShareBillModal bill={saved} onClose={() => nav(`/party/${f.partyId}`, { replace: true })} />
    </Page>
  );
}
