import { findLinked } from '../data/api.js';
import { t as tr } from './i18n.js';

/**
 * Before deleting a bill: if a deposit / jar-return entry was created together with it, ask whether to delete those too.
 * Returns { withLinked, linked } where linked = entries that will be deleted together with the bill.
 */
export async function askLinkedDelete(t, tt = tr) {
  if (t.type !== 'bill') return { withLinked: false, linked: [] };
  let linked = [];
  try { linked = await findLinked(t.id); } catch { linked = []; }
  if (!linked.length) return { withLinked: false, linked: [] };
  const dep = linked.filter((l) => String(l.type).startsWith('deposit')).length;
  const jar = linked.filter((l) => l.type === 'jarReturn').length;
  const parts = [];
  if (dep) parts.push(tt('linked.deposit', { n: dep }));
  if (jar) parts.push(tt('linked.jar', { n: jar }));
  const withLinked = window.confirm(tt('linked.confirm', { parts: parts.join(tt('linked.and')) }));
  return { withLinked, linked: withLinked ? linked : [] };
}
