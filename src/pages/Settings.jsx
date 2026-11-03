import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase.js';
import { useStore } from '../data/store.jsx';
import { saveSettings } from '../data/api.js';
import { Page, Field, StickyBar, useToast } from '../components/ui.jsx';
import { getReads } from '../lib/reads.js';
import { canInstall, promptInstall, onInstallChange, isStandalone, isIOS } from '../lib/pwa.js';

const FREE_LIMIT = 50000;

export default function Settings() {
  const { settings, user } = useStore();
  const toast = useToast();
  const [f, setF] = useState(null);
  const [newMode, setNewMode] = useState('');
  const [, tick] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (settings && !f) setF({ ...settings, paymentModes: [...(settings.paymentModes || [])] }); }, [settings, f]);
  useEffect(() => onInstallChange(() => tick((n) => n + 1)), []);
  if (!f) return null;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setBusy(true);
    try {
      await saveSettings({
        businessName: f.businessName.trim(), address: f.address || '', phone: f.phone || '', billPrefix: f.billPrefix || '',
        footerNote: f.footerNote || '', currency: f.currency || '₹', paymentModes: f.paymentModes,
        nextBillNo: Math.max(1, parseInt(f.nextBillNo, 10) || 1),
      });
      toast('Settings save ho gayi');
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  }
  const addMode = () => {
    const m = newMode.trim();
    if (!m || f.paymentModes.includes(m)) return;
    setF({ ...f, paymentModes: [...f.paymentModes, m] }); setNewMode('');
  };
  const reads = getReads();

  return (
    <Page title="Settings" back="/more">
      <div className="card p-4 space-y-3">
        <h2 className="font-bold">Business details</h2>
        <Field label="Business name"><input className="input" value={f.businessName || ''} onChange={set('businessName')} /></Field>
        <Field label="Address"><textarea className="input !py-2" rows={2} value={f.address || ''} onChange={set('address')} /></Field>
        <Field label="Phone"><input className="input" inputMode="tel" value={f.phone || ''} onChange={set('phone')} /></Field>
        <Field label="Currency symbol"><input className="input" value={f.currency || ''} onChange={set('currency')} /></Field>
      </div>
      <div className="card p-4 space-y-3">
        <h2 className="font-bold">Bill</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bill prefix"><input className="input" value={f.billPrefix || ''} onChange={set('billPrefix')} /></Field>
          <Field label="Next bill number" hint="Sirf tab badlo jab zaroori ho"><input className="input" inputMode="numeric" value={f.nextBillNo ?? 1} onChange={set('nextBillNo')} /></Field>
        </div>
        <Field label="Bill footer note"><textarea className="input !py-2" rows={2} value={f.footerNote || ''} onChange={set('footerNote')} /></Field>
      </div>
      <div className="card p-4 space-y-3">
        <h2 className="font-bold">Payment modes</h2>
        <div className="flex flex-wrap gap-2">
          {f.paymentModes.map((m) => (
            <span key={m} className="chip !text-sm !py-1.5 bg-slate-100">{m}
              <button className="ml-2 text-red-600" onClick={() => setF({ ...f, paymentModes: f.paymentModes.filter((x) => x !== m) })}>✕</button></span>
          ))}
        </div>
        <div className="flex gap-2">
          <input className="input" placeholder="New mode (e.g. Cheque)" value={newMode} onChange={(e) => setNewMode(e.target.value)} />
          <button className="btn" onClick={addMode}>Add</button>
        </div>
      </div>

      <div className="card p-4 space-y-3">
        <h2 className="font-bold">App</h2>
        {!isStandalone() && canInstall() && <button className="btn btn-primary w-full" onClick={promptInstall}>📲 App install karo</button>}
        {!isStandalone() && !canInstall() && (
          <p className="text-sm text-slate-600">{isIOS()
            ? 'iPhone: Safari mein Share button → "Add to Home Screen".'
            : 'Install button tab dikhega jab browser allow kare. Chrome menu (⋮) → "Install app" / "Add to Home screen" bhi use kar sakte ho.'}</p>
        )}
        {isStandalone() && <p className="text-sm text-emerald-700">App installed hai ✓</p>}
        <div>
          <div className="flex justify-between text-sm"><span>Aaj ki reads (is device par, andaaza)</span><b>{reads.toLocaleString('en-IN')} / {FREE_LIMIT.toLocaleString('en-IN')}</b></div>
          <div className="h-2 bg-slate-200 rounded mt-1"><div className={`h-2 rounded ${reads > 35000 ? 'bg-red-500' : 'bg-brand-500'}`} style={{ width: `${Math.min(100, (reads / FREE_LIMIT) * 100)}%` }} /></div>
          <p className="text-xs text-slate-500 mt-1">Yeh sirf is phone/browser ka andaaza hai. Asli count Firebase Console → Usage mein dekho.</p>
        </div>
        <Link to="/recalc" className="btn w-full">🧮 Recalculate balances from entries</Link>
        <Link to="/backup" className="btn w-full">💾 Backup / Restore</Link>
        <p className="text-xs text-slate-500">Logged in: {user?.email}</p>
        <button className="btn btn-danger w-full" onClick={() => signOut(auth)}>Logout</button>
      </div>
      <StickyBar><button className="btn btn-primary flex-1" disabled={busy} onClick={save}>Save settings</button></StickyBar>
    </Page>
  );
}
