// Area tag helpers. settings/main.areas = string[] (admin-managed list); party.area = one string from that list ('' or missing = no area).
// Areas are only ADDED or REMOVED, never renamed (a rename would orphan the strings stored on parties).

export const NO_AREA = '__none__';   // filter value meaning "parties without an area"
export const ALL_AREAS = '';          // filter value meaning "every party"

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

export const normalizeAreaName = (s) => clean(s).slice(0, 60);
export const areaOf = (party) => clean(party?.area);

/** The admin list, trimmed, de-duplicated (case-insensitive), sorted A to Z. Unknown/invalid input gives []. */
export function areaList(settings) {
  const seen = new Set();
  const out = [];
  for (const a of Array.isArray(settings?.areas) ? settings.areas : []) {
    const n = normalizeAreaName(a);
    if (n && !seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); out.push(n); }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

/** Returns { list, error }: the list with `name` added, or the same list plus a Hinglish error message. */
export function addArea(list, name) {
  const n = normalizeAreaName(name);
  if (!n) return { list, error: 'Area ka naam likho.' };
  if (list.some((a) => a.toLowerCase() === n.toLowerCase())) return { list, error: 'Ye area pehle se hai.' };
  return { list: [...list, n].sort((a, b) => a.localeCompare(b)), error: '' };
}

export const partiesUsingArea = (parties, area) => parties.filter((p) => areaOf(p).toLowerCase() === clean(area).toLowerCase());

/** An area can be removed only when no party uses it. */
export function removeArea(list, area, parties) {
  const used = partiesUsingArea(parties, area).length;
  if (used > 0) return { list, error: `${used} party is area mein hai. Pehle unka area badlo.` };
  return { list: list.filter((a) => a !== area), error: '' };
}

/** filter = ALL_AREAS | NO_AREA | an area name */
export function filterByArea(parties, filter) {
  if (!filter) return parties;
  if (filter === NO_AREA) return parties.filter((p) => !areaOf(p));
  return partiesUsingArea(parties, filter);
}

/** Text used by search boxes: name, phone and area. */
export function partyMatches(party, query) {
  const q = clean(query).toLowerCase();
  if (!q) return true;
  return String(party?.name || '').toLowerCase().includes(q) || String(party?.phone || '').includes(q) || areaOf(party).toLowerCase().includes(q);
}

/** Areas that are on parties but missing from the admin list (for example after a restore): shown so nothing is hidden. */
export function strayAreas(list, parties) {
  const known = new Set(list.map((a) => a.toLowerCase()));
  const out = new Map();
  for (const p of parties) { const a = areaOf(p); if (a && !known.has(a.toLowerCase()) && !out.has(a.toLowerCase())) out.set(a.toLowerCase(), a); }
  return [...out.values()].sort((a, b) => a.localeCompare(b));
}

/** Count of parties per area (and 'none') for filter chips. */
export function areaCounts(parties) {
  const m = new Map(); const label = new Map(); let none = 0;   // spelling/case variants count as one area, first spelling is the label
  for (const p of parties) {
    const a = areaOf(p);
    if (!a) { none += 1; continue; }
    const k = a.toLowerCase();
    if (!label.has(k)) label.set(k, a);
    m.set(label.get(k), (m.get(label.get(k)) || 0) + 1);
  }
  return { byArea: m, none };
}
