import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { WarningCircle } from '@phosphor-icons/react';
import { auth } from '../lib/firebase.js';
import { useT } from '../lib/i18n.js';
import LanguageToggle from '../components/LanguageToggle.jsx';

export default function Login() {
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      // No setPersistence() call: the default persistence keeps the user signed in and is safe across tabs/PWA windows.
      await signInWithEmailAndPassword(auth, email.trim(), pw);
    } catch (ex) {
      const m = {
        'auth/invalid-credential': t('login.err.credentials'),
        'auth/wrong-password': t('login.err.credentials'),
        'auth/user-not-found': t('login.err.credentials'),
        'auth/invalid-login-credentials': t('login.err.credentials'),
        'auth/invalid-email': t('login.err.email'),
        'auth/user-disabled': t('login.err.disabled'),
        'auth/too-many-requests': t('login.err.tooMany'),
        'auth/network-request-failed': t('login.err.network'),
      };
      setErr(m[ex.code] || t('login.err.other'));
    } finally { setBusy(false); }
  }
  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 page-enter">
        <div className="space-y-4">
          <img src="/logo.jpg" alt={t('login.logoAlt')} className="w-56 max-w-full rounded-xl" />
          <div>
            <h1 className="text-2xl font-semibold">{t('login.title')}</h1>
            <p className="text-sm text-slate-500 mt-1">{t('login.hint')}</p>
          </div>
        </div>
        <label className="block"><span className="label">{t('login.email')}</span>
          <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="block"><span className="label">{t('login.password')}</span>
          <input className="input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></label>
        {err && (
          <p className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5" role="alert">
            <WarningCircle size={20} weight="fill" className="shrink-0 mt-px" />{err}
          </p>
        )}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? t('login.wait') : t('login.submit')}</button>
        <div className="flex justify-center"><LanguageToggle /></div>
      </form>
    </div>
  );
}
