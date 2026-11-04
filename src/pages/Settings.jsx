import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DownloadSimple, X, Calculator, Database, SignOut, CheckCircle, Info, Sun, Moon, DeviceMobile, Plus } from '@phosphor-icons/react';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase.js';
import { useStore } from '../data/store.jsx';
import { saveSettings } from '../data/api.js';
import { Page, Field, StickyBar, useToast } from '../components/ui.jsx';
import { getReads } from '../lib/reads.js';
import { getTheme, setTheme } from '../lib/theme.js';
import { areaList, addArea, removeArea, partiesUsingArea, strayAreas } from '../lib/areas.js';
import { canInstall, promptInstall, onInstallChange, isStandalone, isIOS } from '../lib/pwa.js';

const FREE_LIMIT = 50000;

export default function Settings() {
  const { settings, user, parties } = useStore();
  const toast = useToast();
  const [f, setF] = useState(null);
  const [newMode, setNewMode] = useState('');
  const [, tick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [nameErr, setNameErr] = useState('');
  const [newArea, setNewArea] = useState('');
  const [areaErr, setAreaErr] = useState('');
  const [nextEdited, setNextEdited] = useState(false); // did the user type in 'Next bill number'?
  const [theme, setThemeState] = useState(getTheme());

  useEffect(() => { if (settings && !f) setF({ ...settings, paymentModes: [...(settings.paymentModes || [])], areas: areaList(settings) }); }, [settings, f]);
  useEffect(() => onInstallChange(() => tick((n) => n + 1)), []);
  // keep 'Next bill number' live (another device may issue bills) until the user edits it
  useEffect(() => {
    if (!settings || nextEdited) return;
    setF((p) => (p && p.nextBillNo !== settings.nextBillNo ? { ...p, nextBillNo: settings.nextBillNo } : p));
  }, [settings, nextEdited]);
  if (!f) return null;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save() {
    if (!(f.businessName || '').trim()) {
      setNameErr('Business name khali nahi ho sakta.');
      toast('Business name likho', 'err');
      return;
    }
    setNameErr('');
    setBusy(true);
    try {
      const patch = {
        businessName: f.businessName.trim(), managerName: f.managerName || '', invoiceFor: f.invoiceFor || '', showDuesOnPdf: f.showDuesOnPdf !== false, billNoPad: Math.max(0, parseInt(f.billNoPad, 10) || 0), address: f.address || '', phone: f.phone || '', billPrefix: f.billPrefix || '',
        footerNote: f.footerNote || '', currency: f.currency || '₹', countryCode: (f.countryCode || '').replace(/\D/g, ''), paymentModes: f.paymentModes, areas: areaList({ areas: f.areas }),
      };
      // Only send the bill counter when the user changed it. Otherwise a stale form would roll the counter back
      // and the next bill would repeat an invoice number issued from another device.
      if (nextEdited) patch.nextBillNo = Math.max(1, parseInt(f.nextBillNo, 10) || 1);
      await saveSettings(patch);
      setNextEdited(false);
      toast('Settings save ho gayi');
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  }
  const addMode = () => {
    const m = newMode.trim();
    if (!m || f.paymentModes.includes(m)) return;
    setF({ ...f, paymentModes: [...f.paymentModes, m] }); setNewMode('');
  };
  const areas = areaList({ areas: f.areas });
  const stray = strayAreas(areas, parties);
  const doAddArea = (name) => {
    const r = addArea(areas, name);
    setAreaErr(r.error);
    if (!r.error) { setF({ ...f, areas: r.list }); setNewArea(''); }
  };
  const doRemoveArea = (a) => {
    const r = removeArea(areas, a, parties);
    setAreaErr(r.error);
    if (!r.error) setF({ ...f, areas: r.list });
  };
  const reads = getReads();

  const H = ({ children }) => <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{children}</h2>;
  const pickTheme = (t) => { setTheme(t); setThemeState(t); };
  const themes = [['system', 'System', DeviceMobile], ['light', 'Light', Sun], ['dark', 'Dark', Moon]];

  return (
    <Page title="Settings" back="/more">
      <section className="space-y-2">
        <H>Business</H>
        <div className="card p-4 space-y-4">
          <Field label="Business name">
            <input className="input" value={f.businessName || ''} aria-invalid={!!nameErr} onChange={(e) => { setNameErr(''); set('businessName')(e); }} />
            {nameErr && <span className="block text-xs text-red-600 mt-1.5" role="alert">{nameErr}</span>}
          </Field>
          <Field label="Manager / contact name" hint="Invoice ke top par 'Manager: …' line mein aayega"><input className="input" value={f.managerName || ''} onChange={set('managerName')} /></Field>
          <Field label="Address" hint="Har line alag likho, invoice mein waisi hi dikhegi"><textarea className="input !py-2.5" rows={2} value={f.address || ''} onChange={set('address')} /></Field>
          <Field label="Phone"><input className="input num" inputMode="tel" value={f.phone || ''} onChange={set('phone')} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Currency symbol"><input className="input" value={f.currency || ''} onChange={set('currency')} /></Field>
            <Field label="Phone country code" hint="WhatsApp ke liye (India = 91)"><input className="input num" inputMode="numeric" value={f.countryCode || ''} onChange={set('countryCode')} /></Field>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <H>Bill and invoice</H>
        <div className="card p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bill prefix"><input className="input" value={f.billPrefix || ''} onChange={set('billPrefix')} /></Field>
            <Field label="Next bill number" hint="Sirf tab badlo jab zaroori ho"><input className="input num" inputMode="numeric" value={f.nextBillNo ?? 1} onChange={(e) => { setNextEdited(true); set('nextBillNo')(e); }} /></Field>
          </div>
          <Field label="Bill number digits" hint="5 = 00104 jaisa. 0 = koi padding nahi"><input className="input num" inputMode="numeric" value={f.billNoPad ?? 0} onChange={set('billNoPad')} /></Field>
          <Field label="Invoice 'FOR' text (default)" hint="Har bill par badal sakte ho"><input className="input" value={f.invoiceFor || ''} onChange={set('invoiceFor')} /></Field>
          <label className="flex items-center gap-3 min-h-[44px] text-sm text-slate-700"><input type="checkbox" className="w-5 h-5 accent-brand-600" checked={f.showDuesOnPdf !== false} onChange={(e) => setF({ ...f, showDuesOnPdf: e.target.checked })} /> Invoice par purana baaki / total baaki line dikhao</label>
          <Field label="Bill footer note"><textarea className="input !py-2.5" rows={2} value={f.footerNote || ''} onChange={set('footerNote')} /></Field>
        </div>
      </section>

      <section className="space-y-2">
        <H>Payment modes</H>
        <div className="card p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {f.paymentModes.map((m) => (
              <span key={m} className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-800 text-sm font-medium pl-3 pr-1 min-h-[44px]">{m}
                <button className="w-10 h-10 rounded-full flex items-center justify-center text-slate-500 active:bg-slate-200" aria-label={`${m} hatao`}
                  onClick={() => setF({ ...f, paymentModes: f.paymentModes.filter((x) => x !== m) })}><X size={16} weight="bold" /></button></span>
            ))}
          </div>
          <div className="flex gap-2">
            <input className="input" placeholder="New mode (e.g. Cheque)" aria-label="Naya payment mode" value={newMode} onChange={(e) => setNewMode(e.target.value)} />
            <button className="btn" onClick={addMode}><Plus size={18} weight="bold" />Add</button>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <H>Areas</H>
        <div className="card p-4 space-y-3">
          {areas.length ? (
            <div className="flex flex-wrap gap-2">
              {areas.map((a) => (
                <span key={a} className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-800 text-sm font-medium pl-3 pr-1 min-h-[44px]">
                  {a}<span className="text-xs text-slate-500 num">({partiesUsingArea(parties, a).length})</span>
                  <button className="w-10 h-10 rounded-full flex items-center justify-center text-slate-500 active:bg-slate-200" aria-label={`${a} hatao`}
                    onClick={() => doRemoveArea(a)}><X size={16} weight="bold" /></button>
                </span>
              ))}
            </div>
          ) : <p className="text-sm text-slate-500">Abhi koi area nahi hai. Neeche naya area jodo, jaise Sai Nagar ya Market.</p>}
          <div className="flex gap-2">
            <input className="input" placeholder="Naya area (jaise Sai Nagar)" aria-label="Naya area" value={newArea} aria-invalid={!!areaErr}
              onChange={(e) => { setNewArea(e.target.value); setAreaErr(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); doAddArea(newArea); } }} />
            <button className="btn" onClick={() => doAddArea(newArea)}><Plus size={18} weight="bold" />Add</button>
          </div>
          {areaErr && <p className="text-xs text-red-600" role="alert">{areaErr}</p>}
          <p className="text-xs text-slate-500">Naam badal nahi sakte, sirf jodo ya hatao. Hatane ke liye us area mein koi party nahi honi chahiye. Neeche "Save settings" dabana na bhoolo.</p>
          {stray.length > 0 && (
            <div className="rounded-xl bg-slate-50 p-3 space-y-2">
              <p className="text-xs text-slate-500">In areas ki parties hain par list mein nahi: {stray.join(', ')}</p>
              <div className="flex flex-wrap gap-2">
                {stray.map((a) => <button key={a} className="btn btn-sm" onClick={() => doAddArea(a)}><Plus size={16} weight="bold" />Add to list: {a}</button>)}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <H>Appearance</H>
        <div className="card p-4">
          <div className="flex bg-slate-100 rounded-xl p-1 gap-1" role="radiogroup" aria-label="Theme">
            {themes.map(([k, label, Icon]) => (
              <button key={k} role="radio" aria-checked={theme === k} onClick={() => pickTheme(k)}
                className={`flex-1 min-h-[40px] rounded-[9px] text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors ${theme === k ? 'bg-surface shadow-sm text-brand-700' : 'text-slate-500'}`}>
                <Icon size={18} />{label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <H>App</H>
        <div className="card p-4 space-y-4">
          {!isStandalone() && canInstall() && <button className="btn btn-primary w-full" onClick={promptInstall}><DownloadSimple size={20} />App install karo</button>}
          {!isStandalone() && !canInstall() && (
            <p className="flex gap-2 text-sm text-slate-600"><Info size={20} className="shrink-0" /><span>{isIOS()
              ? 'iPhone: Safari mein Share button → "Add to Home Screen".'
              : 'Install button tab dikhega jab browser allow kare. Chrome menu (⋮) → "Install app" / "Add to Home screen" bhi use kar sakte ho.'}</span></p>
          )}
          {isStandalone() && <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle size={20} weight="fill" />App installed hai</p>}
          <div>
            <div className="flex justify-between gap-3 text-sm"><span className="text-slate-600">Aaj ki reads (is device par, andaaza)</span><b className="num">{reads.toLocaleString('en-IN')} / {FREE_LIMIT.toLocaleString('en-IN')}</b></div>
            <div className="h-2 bg-slate-200 rounded-full mt-2 overflow-hidden"><div className={`h-2 rounded-full ${reads > 35000 ? 'bg-red-500' : 'bg-brand-500'}`} style={{ width: `${Math.min(100, (reads / FREE_LIMIT) * 100)}%` }} /></div>
            <p className="text-xs text-slate-500 mt-1.5">Yeh sirf is phone/browser ka andaaza hai. Asli count Firebase Console → Usage mein dekho.</p>
          </div>
          <div className="grid gap-2">
            <Link to="/recalc" className="btn w-full"><Calculator size={20} />Recalculate balances from entries</Link>
            <Link to="/backup" className="btn w-full"><Database size={20} />Backup / Restore</Link>
          </div>
          <p className="text-xs text-slate-500">Logged in: {user?.email}</p>
          <button className="btn btn-danger w-full" onClick={() => signOut(auth)}><SignOut size={20} />Logout</button>
        </div>
      </section>
      <StickyBar><button className="btn btn-primary flex-1" disabled={busy} onClick={save}>Save settings</button></StickyBar>
    </Page>
  );
}
