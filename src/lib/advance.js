/** How to show a party's outstanding: positive = Baaki (red), negative = Advance (green). */
export function dueView(outstanding) {
  const o = outstanding || 0;
  if (o < 0) return { label: 'Advance', amount: -o, tone: 'text-emerald-600' };
  return { label: 'Baaki', amount: o, tone: o > 0 ? 'text-red-600' : 'text-slate-800' };
}
