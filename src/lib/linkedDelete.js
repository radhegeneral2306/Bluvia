import { findLinked } from '../data/api.js';

/**
 * Before deleting a bill: if a deposit / jar-return entry was created together with it, ask whether to delete those too.
 * Returns { withLinked, linked } where linked = entries that will be deleted together with the bill.
 */
export async function askLinkedDelete(t) {
  if (t.type !== 'bill') return { withLinked: false, linked: [] };
  let linked = [];
  try { linked = await findLinked(t.id); } catch { linked = []; }
  if (!linked.length) return { withLinked: false, linked: [] };
  const dep = linked.filter((l) => String(l.type).startsWith('deposit')).length;
  const jar = linked.filter((l) => l.type === 'jarReturn').length;
  const parts = [];
  if (dep) parts.push(`${dep} deposit`);
  if (jar) parts.push(`${jar} jar return`);
  const withLinked = window.confirm(`${parts.join(' aur ')} entries is bill ke saath bani thi. Inhe bhi delete karna hai?\n\nOK = sab delete\nCancel = sirf bill delete`);
  return { withLinked, linked: withLinked ? linked : [] };
}
