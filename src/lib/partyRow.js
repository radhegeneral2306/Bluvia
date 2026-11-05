// Helpers for the fast Parties list rows (pure, no Firestore).
import { areaOf } from './areas.js';

/** Short code per jar type: shortCode, else the first letters of the name, else A, B, C by position. */
export function jarCode(jt, index = 0) {
  const sc = String(jt?.shortCode || '').trim();
  if (sc) return sc;
  const nm = String(jt?.name || '').trim();
  if (nm) return nm.slice(0, 2).toUpperCase();
  return String.fromCharCode(65 + (index % 26));
}

/** "Normal 3, Cold 2": jars currently with the party (full type name, only non-zero counts), in jarTypes order. Unknown ids come last as "?". */
export function jarsShort(jarBalance, jarTypes) {
  const bal = jarBalance || {};
  const known = new Set();
  const parts = [];
  (jarTypes || []).forEach((j, i) => {
    known.add(j.id);
    const n = bal[j.id] || 0;
    if (n) parts.push(`${String(j.name || '').trim() || jarCode(j, i)} ${n}`);
  });
  for (const [id, n] of Object.entries(bal)) if (!known.has(id) && n) parts.push(`? ${n}`);
  return parts.join(', ');
}

export const SORTS = [['name', 'Naam'], ['due', 'Sabse zyada baaki'], ['area', 'Area']];

/** Returns a new sorted array. sort = 'name' | 'due' | 'area'. */
export function sortParties(list, sort) {
  const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''));
  const out = [...(list || [])];
  if (sort === 'due') return out.sort((a, b) => (b.outstanding || 0) - (a.outstanding || 0) || byName(a, b));
  if (sort === 'area') {
    return out.sort((a, b) => {
      const x = areaOf(a), y = areaOf(b);
      if (!x !== !y) return x ? -1 : 1; // parties without an area go last
      return x.localeCompare(y) || byName(a, b);
    });
  }
  return out.sort(byName);
}

/** Totals for the header: count of parties and the sum of positive outstanding (money still to collect). */
export function partyTotals(list) {
  let due = 0;
  for (const p of list || []) if ((p.outstanding || 0) > 0) due += p.outstanding;
  return { count: (list || []).length, due };
}
