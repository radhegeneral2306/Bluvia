import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useStore } from '../data/store.jsx';
import { createEntry, updateTxn, getOne } from '../data/api.js';
import { Page, Field, MoneyInput, QtyInput, StickyBar, Tabs, Spinner, useToast } from '../components/ui.jsx';
import PartyPicker from '../components/PartyPicker.jsx';
import { canModifyTxn, STAFF_TYPES } from '../lib/roles.js';
import { dueView } from '../lib/advance.js';
import { todayKey } from '../lib/dates.js';
import { planChange, negativeJarWarnings } from '../lib/ledger.js';
import { depositPerJar } from '../lib/rates.js';

const GROUPS = {
  receipt: { title: 'Receipt', types: ['receipt'] },
  jar: { title: 'Jar Return / Given', types: ['jarReturn', 'jarGiven'] },
  deposit: { title: 'Deposit', types: ['depositTaken', 'depositRefund', 'depositAdjust'] },
  adjustment: { title: 'Adjustment', types: ['adjustment'] },
};
const groupOf = (type) => Object.keys(GROUPS).find((g) => GROUPS[g].types.includes(type));
const LABEL = { jarReturn: 'Jar Return', jarGiven: 'Jar Given', depositTaken: 'Deposit Taken', depositRefund: 'Refund', depositAdjust: 'Adjust vs dues' };

/** Default jar type = the one this party holds the most of (so Jar Return is one-tap for the common case). */
function bestJar(party, jarTypes, fallback) {
  let best = null;
  for (const j of jarTypes) {
    const n = (party?.jarBalance || {})[j.id] || 0;
    if (j.active !== false && n > 0 && (!best || n > best.n)) best = { id: j.id, n };
  }
  if (best) return best.id;
  // nothing is held: pick the type that is most negative (the one that needs fixing)
  let neg = null;
  for (const j of jarTypes) {
    const n = (party?.jarBalance || {})[j.id] || 0;
    if (j.active !== false && n < 0 && (!neg || n < neg.n)) neg = { id: j.id, n };
  }
  return neg ? neg.id : fallback;
}

export default function EntryForm() {
  const { kind, id } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const { settings, jarTypes, partyMap, jarMap, jarName, money, profile, user, isAdmin } = useStore();
  const [old, setOld] = useState(null);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [touchedAmt, setTouchedAmt] = useState(false);

  useEffect(() => {
    if (f) return;
    (async () => {
      if (id) {
        const t = await getOne('transactions', id);
        if (!t) return nav('/', { replace: true });
        setOld(t);
        setF({ ...t, amountSign: t.type === 'adjustment' && t.amount < 0 ? -1 : 1, amount: Math.abs(t.amount || 0) });
        setTouchedAmt(true);
      } else {
        const first = GROUPS[kind].types[0];
        setF({
          type: first, partyId: sp.get('party') || '', dateKey: todayKey(), note: '', amount: 0, qty: 0, jarQty: 0, amountSign: 1,
          mode: settings.paymentModes?.[0] || '', reference: '',
          jarTypeId: bestJar(partyMap[sp.get('party')], jarTypes, jarTypes.find((j) => j.active !== false)?.id || ''),
        });
      }
    })();
  }, [f, id, kind, sp, nav, settings, jarTypes]);

  if (!id && !isAdmin && GROUPS[kind] && !GROUPS[kind].types.some((tp) => STAFF_TYPES.includes(tp))) return <Navigate to="/" replace />;
  if (!f) return <Spinner />;
  if (old && !canModifyTxn(profile, user?.uid, old)) {
    return (
      <Page title="Edit entry" back>
        <div className="card p-4 space-y-3">
          <p className="text-sm text-slate-700">{isAdmin ? 'Ye entry edit nahi ho sakti.' : 'Ye entry ab edit nahi ho sakti. Bill banne ke 1 ghante tak hi staff edit kar sakta hai. Owner se kaho.'}</p>
          <button className="btn w-full" onClick={() => nav(-1)}>Wapas jao</button>
        </div>
      </Page>
    );
  }
  const group = groupOf(f.type);
  const party = partyMap[f.partyId];
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  // auto-fill deposit amount = per-jar deposit x jar qty (until the user types an amount)
  function autoDeposit(next) {
    if (group !== 'deposit' || touchedAmt) return next;
    const per = depositPerJar(partyMap[next.partyId], next.jarTypeId, jarMap);
    return { ...next, amount: per * (next.jarQty || 0) };
  }
  const upd = (patch) => setF((p) => autoDeposit({ ...p, ...patch }));

  async function save() {
    if (!f.partyId) return toast('Party chuno', 'err');
    const isJar = group === 'jar';
    if (isJar && (!f.jarTypeId || !f.qty)) return toast('Jar type aur qty daalo', 'err');
    if (!isJar && !f.amount) return toast('Amount daalo', 'err');

    const t = {
      type: f.type, partyId: f.partyId, partyName: party?.name || f.partyName || '', dateKey: f.dateKey, note: f.note || '',
    };
    if (group === 'receipt') Object.assign(t, { amount: f.amount, mode: f.mode || '', reference: f.reference || '' });
    if (isJar) Object.assign(t, { jarTypeId: f.jarTypeId, qty: f.qty });
    if (group === 'deposit') Object.assign(t, { amount: f.amount, jarTypeId: f.jarTypeId || null, jarQty: f.jarQty || 0 });
    if (group === 'adjustment') Object.assign(t, { amount: f.amount * (f.amountSign || 1) });

    // warnings (never block)
    const plan = planChange(old, { ...t, id: old?.id });
    const warn = negativeJarWarnings(party, plan.parties[f.partyId] || { jars: {} });
    if (warn.length && !window.confirm(`Dhyan do: ${warn.map((w) => `${jarName(w.jarTypeId)} balance ${w.balance} ho jayega`).join(', ')}.\nPhir bhi save karna hai?`)) return;
    if (f.type === 'depositAdjust' && (f.amount > (party?.outstanding || 0) || f.amount > (party?.depositBalance || 0))) {
      if (!window.confirm('Adjust amount party ke baaki paise ya deposit se zyada hai. Phir bhi save?')) return;
    }
    if (f.type === 'depositRefund' && f.amount > (party?.depositBalance || 0)) {
      if (!window.confirm('Refund amount deposit balance se zyada hai. Phir bhi save?')) return;
    }

    setBusy(true);
    try {
      let status;
      if (old) status = await updateTxn(old, t);
      else status = (await createEntry(t)).status;
      toast(status === 'queued' ? 'Phone par save hua. Internet aate hi sync hoga' : 'Save ho gaya', status === 'queued' ? 'warn' : 'ok');
      nav(`/party/${f.partyId}`, { replace: true });
    } catch (e) { toast(e.message, 'err'); setBusy(false); }
  }

  const tabs = GROUPS[group].types.length > 1 ? GROUPS[group].types.filter((tp) => isAdmin || STAFF_TYPES.includes(tp)).map((tp) => [tp, LABEL[tp]]) : null;

  return (
    <Page title={`${old ? 'Edit ' : ''}${GROUPS[group].title}`} back>
      {tabs && <Tabs tabs={tabs} value={f.type} onChange={(v) => set('type', v)} />}
      <div className="space-y-4">
        <Field label="Party"><PartyPicker value={f.partyId} onChange={(v) => upd(group === 'jar' && !old ? { partyId: v, jarTypeId: bestJar(partyMap[v], jarTypes, f.jarTypeId) } : { partyId: v })} /></Field>
        {party && (
          <dl className="grid grid-cols-2 gap-4 text-sm px-1">
            <div className="min-w-0"><dt className="text-slate-500">{dueView(party.outstanding).label}</dt><dd className={`num text-base font-semibold break-words ${dueView(party.outstanding).tone}`}>{money(dueView(party.outstanding).amount)}</dd></div>
            <div><dt className="text-slate-500">Deposit</dt><dd className="num text-base font-semibold text-slate-800">{money(party.depositBalance || 0)}</dd></div>
          </dl>
        )}
        <Field label="Date"><input type="date" className="input num" value={f.dateKey} onChange={(e) => set('dateKey', e.target.value || todayKey())} /></Field>

        {group === 'receipt' && (
          <>
            <Field label="Amount"><MoneyInput className="!text-2xl !min-h-[60px] font-semibold" autoFocus value={f.amount} onChange={(v) => set('amount', v)} /></Field>
            <Field label="Payment mode">
              <select className="input" value={f.mode} onChange={(e) => set('mode', e.target.value)}>
                {[...new Set([...(settings.paymentModes || []), f.mode].filter(Boolean))].map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Reference (UPI ref / cheque no.)"><input className="input" value={f.reference || ''} onChange={(e) => set('reference', e.target.value)} /></Field>
          </>
        )}

        {group === 'jar' && (
          <>
            <Field label="Jar type">
              <select className="input" value={f.jarTypeId || ''} onChange={(e) => set('jarTypeId', e.target.value)}>
                {jarTypes.filter((j) => j.active !== false || j.id === f.jarTypeId).map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
              </select>
            </Field>
            {party && f.jarTypeId && <p className="text-sm text-slate-600 px-1">Abhi party ke paas: <b className="num text-slate-900">{(party.jarBalance || {})[f.jarTypeId] || 0}</b> {jarName(f.jarTypeId)}</p>}
            <Field label="Quantity"><QtyInput className="!text-2xl !min-h-[60px] font-semibold" autoFocus value={f.qty} onChange={(v) => set('qty', v)} /></Field>
          </>
        )}

        {group === 'deposit' && (
          <>
            <Field label="Jar type (optional)">
              <select className="input" value={f.jarTypeId || ''} onChange={(e) => upd({ jarTypeId: e.target.value || null })}>
                <option value="">Koi nahi</option>
                {jarTypes.filter((j) => j.active !== false || j.id === f.jarTypeId).map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
              </select>
            </Field>
            <Field label="Kitne jar ka deposit?" hint={f.jarTypeId ? `Per jar deposit: ${money(depositPerJar(party, f.jarTypeId, jarMap))}` : ''}>
              <QtyInput value={f.jarQty || 0} onChange={(v) => upd({ jarQty: v })} />
            </Field>
            <Field label="Deposit amount (badal sakte ho)">
              <MoneyInput className="!text-2xl !min-h-[60px] font-semibold" value={f.amount} onChange={(v) => { setTouchedAmt(true); set('amount', v); }} />
            </Field>
            {f.type === 'depositAdjust' && <p className="text-xs text-slate-500 px-1">Adjust = deposit bhi kam hoga aur party ka baaki bhi utna kam hoga.</p>}
          </>
        )}

        {group === 'adjustment' && (
          <>
            <Tabs tabs={[['1', 'Baaki badhao (+)'], ['-1', 'Baaki ghatao (-)']]} value={String(f.amountSign)} onChange={(v) => set('amountSign', Number(v))} />
            <Field label="Amount"><MoneyInput className="!text-2xl !min-h-[60px] font-semibold" value={f.amount} onChange={(v) => set('amount', v)} /></Field>
          </>
        )}

        <Field label="Note"><input className="input" value={f.note || ''} onChange={(e) => set('note', e.target.value)} /></Field>
      </div>
      <StickyBar>
        <button className="btn flex-1" onClick={() => nav(-1)}>Cancel</button>
        <button className="btn btn-primary flex-[2]" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
      </StickyBar>
    </Page>
  );
}
