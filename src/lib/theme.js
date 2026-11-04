// Theme: 'system' (follow phone), 'light' or 'dark'. Stored per device; applied on <html data-theme>.
const KEY = 'bluvia_theme';
export function getTheme() { try { return localStorage.getItem(KEY) || 'system'; } catch { return 'system'; } }
export function setTheme(t) {
  try { if (t === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, t); } catch { /* ignore */ }
  applyTheme();
}
export function applyTheme() {
  const t = getTheme();
  const el = document.documentElement;
  if (t === 'system') el.removeAttribute('data-theme'); else el.setAttribute('data-theme', t);
}
