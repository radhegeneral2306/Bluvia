import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { WarningCircle } from '@phosphor-icons/react';
import { auth } from '../lib/firebase.js';

export default function Login() {
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
        'auth/invalid-credential': 'Email ya password galat hai.',
        'auth/wrong-password': 'Email ya password galat hai.',
        'auth/user-not-found': 'Email ya password galat hai.',
        'auth/invalid-login-credentials': 'Email ya password galat hai.',
        'auth/invalid-email': 'Email sahi nahi hai.',
        'auth/user-disabled': 'Ye account band kar diya gaya hai.',
        'auth/too-many-requests': 'Bahut zyada try ho gaye. Thodi der baad try karo.',
        'auth/network-request-failed': 'Internet nahi hai. Login ke liye internet chahiye.',
      };
      setErr(m[ex.code] || 'Login nahi ho paya. Thodi der baad dobara try karo.');
    } finally { setBusy(false); }
  }
  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 page-enter">
        <div className="space-y-4">
          <img src="/logo.jpg" alt="Bluvia Pure Drinking Water" className="w-56 max-w-full rounded-xl" />
          <div>
            <h1 className="text-2xl font-semibold">Login karo</h1>
            <p className="text-sm text-slate-500 mt-1">Apne email aur password se andar aao.</p>
          </div>
        </div>
        <label className="block"><span className="label">Email</span>
          <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="block"><span className="label">Password</span>
          <input className="input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></label>
        {err && (
          <p className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5" role="alert">
            <WarningCircle size={20} weight="fill" className="shrink-0 mt-px" />{err}
          </p>
        )}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Wait…' : 'Login'}</button>
      </form>
    </div>
  );
}
