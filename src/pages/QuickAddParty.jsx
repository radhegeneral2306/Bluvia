import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../data/store.jsx';
import { createParty } from '../data/api.js';
import { Page, Field, useToast } from '../components/ui.jsx';
import { areaList, areaOf } from '../lib/areas.js';
import { todayKey } from '../lib/dates.js';
import { buildPartyData, validateQuick, nextFormAfterSave, progress, partiesAddedToday, summaryLine, emptyQuickForm } from '../lib/quickAdd.js';

const isTouch = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
const AREA_KEY = 'bluvia_quickadd_area';
const readArea = () => { try { return localStorage.getItem(AREA_KEY) || ''; } catch { return ''; } };
const writeArea = (a) => { try { localStorage.setItem(AREA_KEY, a); } catch { /* ignore */ } };
const cleanMoney = (v) => v.replace(/[^0-9.]/g, '');
const cleanInt = (v) => v.replace(/[^0-9]/g, '').slice(0, 5);

export default function QuickAddParty() {
  const toast = useToast();
  const { parties, jarTypes, settings, money } = useStore();
  const [f, setF] = useState(() => emptyQuickForm(readArea()));
  const [busy, setBusy] = useState(false);
  const formRef = useRef(null);
  const nameRef = useRef(null);
  const savingRef = useRef(false);

  const areas = areaList(settings);
  const cur = areaOf(f);
  const areaOptions = cur && !areas.some((a) => a.toLowerCase() === cur.toLowerCase()) ? [...areas, cur] : areas;
  const jars = jarTypes.filter((j) => j.active !== false);
  const tk = todayKey();
  const { addedToday, total } = progress(parties, tk);
  const todayList = useMemo(() => partiesAddedToday(parties, tk), [parties, tk]);
  const { errors, warnings } = validateQuick(f, parties);
  const summary = f.name.trim() ? summaryLine(f, jarTypes) : '';

  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));
  const setMap = (k, id, v) => setF((o) => ({ ...o, [k]: { ...o[k], [id]: v } }));

  function focusables() { return Array.from(formRef.current?.querySelectorAll('[data-qa]') || []); }
  function onKeyDown(e) {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    const el = e.target;
    if (!el.matches || !el.matches('[data-qa]')) return;
    e.preventDefault();
    const list = focusables();
    const i = list.indexOf(el);
    if (i >= 0 && i < list.length - 1) list[i + 1].focus();
    else save();
  }

  async function save() {
    if (savingRef.current) return;
    if (errors.length) return toast(errors[0], 'err');
    savingRef.current = true;
    setBusy(true);
    try {
      const data = buildPartyData(f, jarTypes);
      await createParty(data);
      if (data.area) writeArea(data.area);
      toast(`${data.name} save ho gayi`);
      setF(nextFormAfterSave(f));
      setTimeout(() => nameRef.current?.focus(), 0);
    } catch (e) { toast(e.message, 'err'); }
    finally { savingRef.current = false; setBusy(false); }
  }

  return (
    <Page title="Quick add party">
      <div className="card p-4 !py-3">
        <div className="font-semibold num">Aaj {addedToday} jode, total {total} parties</div>
      </div>

      <div className="card p-4 space-y-3" ref={formRef} onKeyDown={onKeyDown}>
        <Field label="Name *"><input data-qa className="input" ref={nameRef} autoFocus={!isTouch()} autoComplete="off" enterKeyHint="next" value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Area">
          <select data-qa className="input" value={cur} onChange={(e) => set('area', e.target.value)}>
            <option value="">Koi area nahi</option>
            {areaOptions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </Field>
        <Field label="Phone"><input data-qa className="input" inputMode="tel" autoComplete="off" enterKeyHint="next" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dues (Rs)"><input data-qa className="input num" inputMode="decimal" placeholder="0" enterKeyHint="next" value={f.dues} onChange={(e) => set('dues', cleanMoney(e.target.value))} /></Field>
          <Field label="Deposit held (Rs)"><input data-qa className="input num" inputMode="decimal" placeholder="0" enterKeyHint="next" value={f.deposit} onChange={(e) => set('deposit', cleanMoney(e.target.value))} /></Field>
        </div>
        {jars.map((j, idx) => (
          <div key={j.id} className="rounded-xl bg-slate-50 p-3 space-y-2">
            <div className="font-semibold text-sm">{j.name} <span className="text-slate-500 font-normal">(default {money(j.defaultRate || 0)}, dep {money(j.defaultDeposit || 0)})</span></div>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Jars held"><input data-qa className="input num" inputMode="numeric" placeholder="0" enterKeyHint="next" value={f.jars[j.id] || ''} onChange={(e) => setMap('jars', j.id, cleanInt(e.target.value))} /></Field>
              <Field label="Rate (Rs)"><input data-qa className="input num" inputMode="decimal" placeholder="default" enterKeyHint="next" value={f.rates[j.id] || ''} onChange={(e) => setMap('rates', j.id, cleanMoney(e.target.value))} /></Field>
              <Field label="Deposit/jar"><input data-qa className="input num" inputMode="decimal" placeholder="default" enterKeyHint={idx === jars.length - 1 ? 'done' : 'next'} value={f.deposits[j.id] || ''} onChange={(e) => setMap('deposits', j.id, cleanMoney(e.target.value))} /></Field>
            </div>
          </div>
        ))}
        {!areas.length && <p className="text-xs text-slate-500">Abhi koi area nahi hai. <Link to="/settings" className="text-brand-700 underline">Settings mein area jodo</Link></p>}

        {summary && <p className="text-sm font-medium break-words rounded-xl bg-slate-50 p-3" aria-live="polite">{summary}</p>}
        {warnings.map((w) => <p key={w} className="text-sm text-amber-700">{w}. Phir bhi save kar sakte ho.</p>)}
        <button type="button" className="btn btn-primary w-full min-h-[48px]" disabled={busy} onClick={save}>{busy ? 'Saving...' : 'Save aur agla'}</button>
      </div>

      <div className="card p-4 space-y-2">
        <h2 className="font-semibold">Aaj jode gaye ({todayList.length})</h2>
        {!todayList.length && <p className="text-sm text-slate-500">Abhi tak koi party nahi joda.</p>}
        {todayList.map((p) => {
          const jb = Object.entries(p.jarBalance || {}).filter(([, n]) => n).map(([id, n]) => `${jarTypes.find((j) => j.id === id)?.name || id} ${n}`).join(' ');
          return (
            <Link key={p.id} to={`/party/${p.id}`} className="block min-h-[44px] py-2 border-t border-slate-100 first:border-0">
              <div className="font-medium truncate">{p.name}</div>
              <div className="text-xs text-slate-500 break-words">{areaOf(p) || 'Koi area nahi'} , Baaki {money(p.outstanding || 0)} , Jars {jb || 'koi nahi'}</div>
            </Link>
          );
        })}
      </div>
    </Page>
  );
}
