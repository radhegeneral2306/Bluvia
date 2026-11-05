// Pure helpers for the Staff screen (no Firebase here, so they are easy to unit test).

export const NAME_MAX = 60;

/** Firebase Auth UIDs are 20 to 40 letters and digits. Pasted text often carries spaces, so trim first. */
export function normalizeUid(uid) {
  return String(uid ?? '').trim();
}

export function normalizeName(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ');
}

/** Returns { ok, errors: { uid?, name? }, value: { uid, name } }. Messages are Hinglish. */
export function validateStaff({ uid, name } = {}) {
  const u = normalizeUid(uid);
  const n = normalizeName(name);
  const errors = {};
  if (!n) errors.name = 'Naam likho.';
  else if (n.length > NAME_MAX) errors.name = `Naam ${NAME_MAX} akshar se chhota rakho.`;
  if (!u) errors.uid = 'UID likho.';
  else if (!/^[A-Za-z0-9]+$/.test(u)) errors.uid = 'UID mein sirf English akshar aur number hote hain, space ya symbol nahi.';
  else if (u.length < 20 || u.length > 40) errors.uid = 'UID 20 se 40 akshar ka hota hai. Firebase console se poora copy karo.';
  return { ok: Object.keys(errors).length === 0, errors, value: { uid: u, name: n } };
}

/** First 6 characters of a UID, for display only. */
export function shortUid(uid) {
  const u = String(uid ?? '');
  return u.length > 8 ? `${u.slice(0, 6)}...${u.slice(-4)}` : u;
}

/** Turn user docs ({ id, name, role, active, createdAt }) into rows: active first, then by name. Bad input gives []. */
export function staffRows(docs) {
  if (!Array.isArray(docs)) return [];
  return docs
    .filter((d) => d && d.id)
    .map((d) => ({
      id: String(d.id),
      name: String(d.name || '').trim() || 'Bina naam',
      role: d.role === 'admin' ? 'admin' : 'staff',
      active: d.active !== false,
      createdAt: d.createdAt || null,
    }))
    .sort((a, b) => (a.active === b.active ? a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id) : a.active ? -1 : 1));
}
