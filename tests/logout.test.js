import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/lib/firebase.js', () => ({ auth: {}, db: {} }));
const { secureLogout, clearLocalData, clearDataCaches } = await import('../src/lib/logout.js');

const memStore = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), keys: () => [...m.keys()] };
};
const fakeCaches = (names) => { const set = new Set(names); return { keys: async () => [...set], delete: async (n) => set.delete(n), has: (n) => set.has(n) }; };
const setup = (over = {}) => {
  const calls = [];
  const env = { local: memStore({ bluvia_theme: 'dark', bluvia_pdf_layout: 'thermal', bluvia_reads_2026: '120', bluvia_last: 'x', other_app: 'keep' }),
    session: memStore({ draft: '{"party":"p1"}' }), caches: fakeCaches(['workbox-precache-v2', 'firestore-cache', 'api-data', 'images']), reload: () => calls.push('reload') };
  const deps = {
    auth: { id: 'auth' }, db: { id: 'db' },
    waitForPendingWrites: async () => { calls.push('wait'); },
    signOut: async () => { calls.push('signOut'); }, terminate: async () => { calls.push('terminate'); }, clearIndexedDbPersistence: async () => { calls.push('clear'); },
    ...over,
  };
  return { env, deps, calls };
};

describe('secureLogout', () => {
  it('signs out, wipes the offline cache and local data, keeps preferences, then reloads', async () => {
    const { env, deps, calls } = setup();
    const r = await secureLogout({ env, deps, confirm: () => { throw new Error('must not ask'); } });
    expect(r).toEqual({ ok: true });
    expect(calls).toEqual(['wait', 'signOut', 'terminate', 'clear', 'reload']);
    expect(env.local.keys().sort()).toEqual(['bluvia_pdf_layout', 'bluvia_theme', 'other_app']);   // drafts, counters gone, preferences and other apps kept
    expect(env.session.length).toBe(0);
    expect(await env.caches.keys()).toEqual(['workbox-precache-v2', 'images']);                    // shell precache stays
  });

  it('unsynced writes (timeout): declining keeps the session and the data', async () => {
    const { env, deps, calls } = setup({ waitForPendingWrites: () => new Promise(() => {}) });
    let asked = '';
    const r = await secureLogout({ env, deps, pendingMs: 20, confirm: (m) => { asked = m; return false; } });
    expect(r).toEqual({ ok: false });
    expect(asked).toMatch(/sync nahi hui/);
    expect(calls).toEqual([]);                                  // no signOut, no terminate, no reload
    expect(env.local.getItem('bluvia_last')).toBe('x'); expect(env.session.getItem('draft')).not.toBeNull();
  });

  it('unsynced writes: accepting continues the logout', async () => {
    const { env, deps, calls } = setup({ waitForPendingWrites: () => new Promise(() => {}) });
    const r = await secureLogout({ env, deps, pendingMs: 20, confirm: () => true });
    expect(r.ok).toBe(true); expect(calls).toContain('signOut'); expect(calls).toContain('reload');
  });

  it('a rejected waitForPendingWrites is treated as unsynced', async () => {
    const { env, deps } = setup({ waitForPendingWrites: async () => { throw new Error('offline'); } });
    let asked = false;
    await secureLogout({ env, deps, confirm: () => { asked = true; return false; } });
    expect(asked).toBe(true);
  });

  it('failures while clearing never block the logout', async () => {
    const { env, deps, calls } = setup({
      terminate: async () => { throw new Error('boom'); }, clearIndexedDbPersistence: async () => { throw new Error('in use'); }, signOut: async () => { throw new Error('net'); },
    });
    env.local.removeItem = () => { throw new Error('storage'); };
    env.caches.keys = async () => { throw new Error('caches'); };
    const r = await secureLogout({ env, deps, confirm: () => true });
    expect(r).toEqual({ ok: true }); expect(calls).toEqual(['wait', 'reload']);
  });

  it('works when Firebase is not configured (no db, no auth) and when storage is missing', async () => {
    const calls = [];
    const r = await secureLogout({ env: { local: null, session: null, caches: null, reload: () => calls.push('reload') }, deps: { auth: null, db: null } });
    expect(r).toEqual({ ok: true }); expect(calls).toEqual(['reload']);
  });
});

describe('clear helpers', () => {
  it('clearLocalData only touches bluvia_ keys that are not preferences', () => {
    const env = { local: memStore({ bluvia_x: '1', bluvia_theme: 'light', keep: '1' }), session: memStore({ a: '1' }) };
    clearLocalData(env);
    expect(env.local.keys().sort()).toEqual(['bluvia_theme', 'keep']); expect(env.session.length).toBe(0);
  });
  it('clearDataCaches removes firestore and data caches only', async () => {
    const c = fakeCaches(['workbox-precache-x-data', 'my-firestore', 'DATA', 'fonts']);
    await clearDataCaches(c);
    expect(await c.keys()).toEqual(['workbox-precache-x-data', 'fonts']);
    await clearDataCaches(null);
  });
});
