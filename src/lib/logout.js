// Logout that also wipes the data this phone kept (Firestore offline cache, drafts, counters), for shared or lost phones.
import { signOut } from 'firebase/auth';
import { terminate, clearIndexedDbPersistence, waitForPendingWrites } from 'firebase/firestore';
import { auth, db } from './firebase.js';

const KEEP_KEYS = new Set(['bluvia_theme', 'bluvia_pdf_layout']);   // preferences, not data
const PENDING_MS = 4000;

const UNSYNCED = 'Kuch entries abhi sync nahi hui (internet nahi ya slow). Logout karoge to wo kho sakti hain. Phir bhi logout karna hai?';

function browserEnv() {
  return {
    local: typeof localStorage !== 'undefined' ? localStorage : null,
    session: typeof sessionStorage !== 'undefined' ? sessionStorage : null,
    caches: typeof caches !== 'undefined' ? caches : null,
    reload: () => window.location.replace('/'),
  };
}

/** Removes bluvia_* keys except preferences; clears session storage (bill drafts). Never throws. */
export function clearLocalData(env) {
  try {
    const ls = env.local;
    if (ls) {
      const keys = [];
      for (let i = 0; i < ls.length; i++) keys.push(ls.key(i));
      keys.filter((k) => k && k.startsWith('bluvia_') && !KEEP_KEYS.has(k)).forEach((k) => ls.removeItem(k));
    }
  } catch { /* ignore */ }
  try { env.session && env.session.clear(); } catch { /* ignore */ }
}

/** Deletes data caches (names with 'firestore' or 'data'); the app-shell precache stays so the app still opens offline. */
export async function clearDataCaches(cacheStorage) {
  if (!cacheStorage) return;
  try {
    for (const name of await cacheStorage.keys()) {
      if (name.startsWith('workbox-precache')) continue;
      if (/firestore|data/i.test(name)) await cacheStorage.delete(name);
    }
  } catch { /* ignore */ }
}

/**
 * Safe logout. Returns { ok: false } when the user cancels because some writes are still unsynced.
 * `deps` and `env` are injectable for tests.
 */
export async function secureLogout({ confirm = (m) => window.confirm(m), env = browserEnv(), deps = {}, pendingMs = PENDING_MS } = {}) {
  const d = { auth, db, signOut, terminate, clearIndexedDbPersistence, waitForPendingWrites, ...deps };

  if (d.db) {
    let timer;
    const synced = await Promise.race([
      Promise.resolve().then(() => d.waitForPendingWrites(d.db)).then(() => true, () => false),
      new Promise((resolve) => { timer = setTimeout(() => resolve(false), pendingMs); }),
    ]);
    clearTimeout(timer);
    if (!synced && !confirm(UNSYNCED)) return { ok: false };
  }

  try { if (d.auth) await d.signOut(d.auth); } catch { /* ignore, local wipe still runs */ }
  if (d.db) {
    try { await d.terminate(d.db); } catch { /* ignore */ }
    try { await d.clearIndexedDbPersistence(d.db); } catch { /* ignore: not fatal */ }
  }
  clearLocalData(env);
  await clearDataCaches(env.caches);
  try { env.reload(); } catch { /* ignore */ }
  return { ok: true };
}
