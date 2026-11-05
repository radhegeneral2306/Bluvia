// Pure helpers for the Quick add party screen. Money is integer paise (toPaise); form fields are plain strings.
import { toPaise, fmtMoney } from './money.js';
import { areaOf } from './areas.js';

export const emptyQuickForm = (area = '') => ({ name: '', area, phone: '', dues: '', deposit: '', jars: {}, rates: {}, deposits: {} });

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Phone: empty is fine; otherwise only digits, spaces, + and -, with 7 to 15 digits (same rule as PartyForm). */
export function phoneInvalid(p) {
  const s = String(p || '').trim();
  if (!s) return false;
  if (!/^[0-9+\s-]+$/.test(s)) return true;
  const d = s.replace(/\D/g, '').length;
  return d < 7 || d > 15;
}

const activeJars = (jarTypes) => (jarTypes || []).filter((j) => j && j.active !== false);
const wholeJars = (v) => { const n = Math.floor(Number(String(v ?? '').replace(/[^0-9]/g, '')) || 0); return n > 0 ? n : 0; };

/** Returns { errors: string[], warnings: string[] }. Duplicate name is only a warning. */
export function validateQuick(form, existingParties = []) {
  const errors = [];
  const warnings = [];
  const name = String(form?.name || '').trim();
  if (!name) errors.push('Party ka naam likho');
  if (phoneInvalid(form?.phone)) errors.push('Phone number sahi nahi hai (7 se 15 digit)');
  if (name) {
    const nm = norm(name);
    if ((existingParties || []).some((p) => norm(p?.name) === nm)) warnings.push('Is naam ki party pehle se hai');
  }
  return { errors, warnings };
}

/** The object passed to createParty (same shape as PartyForm). Throws if the form is invalid. */
export function buildPartyData(form, jarTypes) {
  const name = String(form?.name || '').trim();
  if (!name) throw new Error('Party ka naam likho');
  if (phoneInvalid(form?.phone)) throw new Error('Phone number sahi nahi hai (7 se 15 digit)');
  const openingJars = {};
  const jarRates = {};
  for (const j of activeJars(jarTypes)) {
    const n = wholeJars(form.jars?.[j.id]);
    if (n) openingJars[j.id] = n;
    const rate = toPaise(form.rates?.[j.id]);
    const dep = toPaise(form.deposits?.[j.id]);
    if (rate > 0 || dep > 0) jarRates[j.id] = { rate: rate > 0 ? rate : 0, deposit: dep > 0 ? dep : 0 };
  }
  return {
    name, phone: String(form.phone || '').trim(), address: '', area: areaOf(form), notes: '', active: true,
    openingBalance: toPaise(form.dues), openingJars, openingDeposit: toPaise(form.deposit), jarRates, itemRates: {},
  };
}

/** One-line check summary shown before saving. */
export function summaryLine(form, jarTypes) {
  const d = buildSafe(form, jarTypes);
  if (!d) return '';
  const jars = activeJars(jarTypes).filter((j) => d.openingJars[j.id]).map((j) => `${j.name} ${d.openingJars[j.id]}`).join(' ');
  return `${d.name}, Baaki ${fmtMoney(d.openingBalance, 'Rs ')}, Deposit ${fmtMoney(d.openingDeposit, 'Rs ')}, Jars ${jars || 'koi nahi'}`;
}
function buildSafe(form, jarTypes) { try { return buildPartyData(form, jarTypes); } catch { return null; } }

/** After a save: keep the area, clear everything else. */
export function nextFormAfterSave(form) { return emptyQuickForm(areaOf(form)); }

const millisOf = (ts) => {
  if (!ts) return null;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  if (ts instanceof Date) return ts.getTime();
  return typeof ts === 'number' ? ts : null;
};
const keyOfMs = (ms) => { const d = new Date(ms); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

/** Parties created today (local day), newest first. A pending server timestamp (null) counts as just now. */
export function partiesAddedToday(parties, todayKey, nowMs = Date.now()) {
  const out = [];
  for (const p of parties || []) {
    if (!p) continue;
    const raw = p.createdAt;
    if (raw === undefined) continue; // old data without createdAt
    const ms = raw === null ? nowMs : millisOf(raw);
    if (ms !== null && keyOfMs(ms) === todayKey) out.push({ p, ms });
  }
  return out.sort((a, b) => b.ms - a.ms).map((x) => x.p);
}

export function progress(parties, todayKey, nowMs = Date.now()) {
  return { addedToday: partiesAddedToday(parties, todayKey, nowMs).length, total: (parties || []).length };
}
