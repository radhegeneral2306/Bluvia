// Local ESTIMATE of Firestore reads done by this device today (free plan = 50,000 reads/day total).
import { todayKey } from './dates.js';
const key = () => `bluvia_reads_${todayKey()}`;
export function addReads(n) {
  try { localStorage.setItem(key(), String(getReads() + Math.max(0, n))); } catch { /* ignore */ }
}
export function getReads() {
  try { return Number(localStorage.getItem(key())) || 0; } catch { return 0; }
}
