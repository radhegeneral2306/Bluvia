import { useState } from 'react';
import { signInWithEmailAndPassword, setPersistence, browserLocalPersistence } from 'firebase/auth';
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
      await setPersistence(auth, browserLocalPersistence); // stay signed in
      await signInWithEmailAndPassword(auth, email.trim(), pw);
    } catch (ex) {
      const m = {
        'auth/invalid-credential': 'Email ya password galat hai.',
        'auth/invalid-email': 'Email sahi nahi hai.',
        'auth/too-many-requests': 'Bahut zyada try ho gaye. Thodi der baad try karo.',
        'auth/network-request-failed': 'Internet nahi hai. Login ke liye internet chahiye.',
      };
      setErr(m[ex.code] || `Login nahi hua (${ex.code || ex.message})`);
    } finally { setBusy(false); }
  }
  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <form onSubmit={submit} className="card w-full max-w-sm p-6 space-y-4">
        <div className="text-center">
          <img src="/logo.jpg" alt="Bluvia Pure Drinking Water" className="w-56 max-w-full mx-auto rounded-lg" />
          <p className="text-sm text-slate-500">Login karo</p>
        </div>
        <div><span className="label">Email</span>
          <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div><span className="label">Password</span>
          <input className="input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Wait…' : 'Login'}</button>
      </form>
    </div>
  );
}
