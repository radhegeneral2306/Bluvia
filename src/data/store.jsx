import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { auth, db, configured } from '../lib/firebase.js';
import { addReads } from '../lib/reads.js';
import { todayKey } from '../lib/dates.js';
import { fmtMoney } from '../lib/money.js';
import { seedDefaults, DEFAULT_SETTINGS } from './api.js';

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);

const sortByName = (a, b) => (a.name || '').localeCompare(b.name || '');

export function StoreProvider({ children }) {
  const [user, setUser] = useState(configured ? undefined : null);
  const [settings, setSettings] = useState(null);
  const [jarTypes, setJarTypes] = useState([]);
  const [items, setItems] = useState([]);
  const [parties, setParties] = useState([]);
  const [summary, setSummary] = useState(null);
  const [daily, setDaily] = useState(null);
  const [today, setToday] = useState(todayKey());
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [loaded, setLoaded] = useState({ settings: false, parties: false });
  const [accessError, setAccessError] = useState(null);
  const seeding = useRef(false);

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    const t = setInterval(() => setToday(todayKey()), 60000);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); clearInterval(t); };
  }, []);

  useEffect(() => {
    if (!configured) return undefined;
    return onAuthStateChanged(auth, (u) => setUser(u || null));
  }, []);

  useEffect(() => {
    if (!user || !db) return undefined;
    setAccessError(null);
    const err = (e) => { console.error(e); if (e.code === 'permission-denied') setAccessError('permission-denied'); };
    const count = (snap, n) => { if (!snap.metadata.fromCache) addReads(Math.max(1, n)); };
    const unsubs = [];
    unsubs.push(onSnapshot(doc(db, 'settings', 'main'), (s) => {
      count(s, 1);
      if (s.exists()) setSettings({ ...DEFAULT_SETTINGS, ...s.data() });
      else if (!s.metadata.fromCache && !seeding.current) {
        seeding.current = true;
        seedDefaults().catch((e) => { console.error(e); seeding.current = false; });
      }
      setLoaded((l) => ({ ...l, settings: true }));
    }, err));
    unsubs.push(onSnapshot(collection(db, 'jarTypes'), (s) => {
      count(s, s.docChanges().length);
      setJarTypes(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort(sortByName));
    }, err));
    unsubs.push(onSnapshot(collection(db, 'items'), (s) => {
      count(s, s.docChanges().length);
      setItems(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort(sortByName));
    }, err));
    unsubs.push(onSnapshot(collection(db, 'parties'), (s) => {
      count(s, s.docChanges().length);
      setParties(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort(sortByName));
      setLoaded((l) => ({ ...l, parties: true }));
    }, err));
    unsubs.push(onSnapshot(doc(db, 'stats', 'summary'), (s) => { count(s, 1); setSummary(s.exists() ? s.data() : {}); }, err));
    return () => unsubs.forEach((u) => u());
  }, [user]);

  useEffect(() => {
    if (!user || !db) return undefined;
    return onSnapshot(doc(db, 'stats', `daily_${today}`), (s) => {
      if (!s.metadata.fromCache) addReads(1);
      setDaily(s.exists() ? s.data() : {});
    }, () => {});
  }, [user, today]);

  const partyMap = useMemo(() => Object.fromEntries(parties.map((p) => [p.id, p])), [parties]);
  const jarMap = useMemo(() => Object.fromEntries(jarTypes.map((j) => [j.id, j])), [jarTypes]);
  const itemMap = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const currency = settings?.currency || '₹';
  const money = useCallback((p) => fmtMoney(p, currency), [currency]);
  const jarName = useCallback((id) => jarMap[id]?.name || '(deleted jar type)', [jarMap]);

  const value = {
    user, settings, jarTypes, items, parties, partyMap, jarMap, itemMap, summary, daily, today, online,
    ready: loaded.settings && loaded.parties && !!settings, accessError, money, currency, jarName,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
