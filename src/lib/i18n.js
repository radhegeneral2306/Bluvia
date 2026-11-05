// Tiny dependency-free i18n. Keys are namespaced ('nav.home', 'bill.save'); params use {name}.
// Language per user: users/{uid}.lang ('en' | 'hi'), mirrored in localStorage 'bluvia_lang'.
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase.js';
import { useStore } from '../data/store.jsx';
import en from '../locales/en.js';
import hi from '../locales/hi.js';

export const LANGS = ['en', 'hi'];
// Page texts live in src/locales/pages/*.js, each file `export default { en: {...}, hi: {...} }` (merged here, so page owners never share a file).
const pageFiles = import.meta.glob('../locales/pages/*.js', { eager: true });
for (const m of Object.values(pageFiles)) {
  Object.assign(en, m.default?.en || {});
  Object.assign(hi, m.default?.hi || {});
}
export const MESSAGES = { en, hi };
const LS_KEY = 'bluvia_lang';

const isLang = (l) => l === 'en' || l === 'hi';

/** Pure lookup: lang -> English -> key itself, then {param} interpolation. */
export function translate(lang, key, params) {
  let s = MESSAGES[lang]?.[key];
  if (s === undefined || s === '') s = MESSAGES.en[key];
  if (s === undefined || s === '') s = key;
  if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] === undefined || params[k] === null ? m : String(params[k])));
  return s;
}

/** Language when nothing is saved: owner English, staff Hindi. */
export const defaultLang = (profile) => (profile?.role === 'staff' ? 'hi' : profile?.role === 'admin' ? 'en' : 'hi');

function readLocal() {
  try { const v = localStorage.getItem(LS_KEY); return isLang(v) ? v : null; } catch { return null; }
}
function writeLocal(lang) {
  try { localStorage.setItem(LS_KEY, lang); } catch { /* private mode: ignore */ }
}

// A change made in this session wins over the (slightly stale) profile snapshot.
let override = null;
const listeners = new Set();
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const getOverride = () => override;

/** Resolve the active language. */
export function resolveLang(profile) {
  if (isLang(override)) return override;
  if (isLang(profile?.lang)) return profile.lang;
  return readLocal() || defaultLang(profile);
}

let current = 'en';
/** Plain t() for code outside React (uses the language last resolved by useT). */
export const t = (key, params) => translate(current, key, params);

export function useT() {
  const { user, profile } = useStore();
  useSyncExternalStore(subscribe, getOverride, getOverride);
  const lang = resolveLang(profile);
  current = lang;
  const uid = user?.uid;
  const tt = useCallback((key, params) => translate(lang, key, params), [lang]);
  const setLang = useCallback((next) => {
    if (!isLang(next)) return;
    override = next; current = next;
    writeLocal(next);
    listeners.forEach((fn) => fn());
    if (uid && db) {
      try { Promise.resolve(updateDoc(doc(db, 'users', uid), { lang: next })).catch(() => {}); } catch { /* offline: ignore */ }
    }
  }, [uid]);
  return useMemo(() => ({ t: tt, lang, setLang }), [tt, lang, setLang]);
}

/** Test helper. */
export function _resetLangForTests() { override = null; }
