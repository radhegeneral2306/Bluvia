import { useMemo, useState } from 'react';
import { useStore } from '../data/store.jsx';
import { Page, Empty, useToast } from '../components/ui.jsx';
import { shareText } from '../lib/share.js';
import { fromPaise } from '../lib/money.js';
import { downloadBlob } from '../lib/backup.js';

export default function JarReport() {
  const { parties, jarTypes, money, settings } = useStore();
  const toast = useToast();
  const [sort, setSort] = useState({ key: 'name', dir: 1 });
  const types = jarTypes.filter((j) => j.active !== false || parties.some((p) => (p.jarBalance || {})[j.id]));

  const rows = useMemo(() => {
    const r = parties
      .filter((p) => Object.values(p.jarBalance || {}).some(Boolean) || p.depositBalance)
      .map((p) => ({ p, name: p.name, deposit: p.depositBalance || 0, total: Object.values(p.jarBalance || {}).reduce((a, b) => a + b, 0) }));
    const val = (x) => (sort.key === 'name' ? x.name.toLowerCase() : sort.key === 'deposit' ? x.deposit : sort.key === 'total' ? x.total : (x.p.jarBalance || {})[sort.key] || 0);
    return r.sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sort.dir);
  }, [parties, sort]);

  const totals = useMemo(() => {
    const t = { deposit: 0, total: 0, by: {} };
    for (const r of rows) { t.deposit += r.deposit; t.total += r.total; for (const j of types) t.by[j.id] = (t.by[j.id] || 0) + ((r.p.jarBalance || {})[j.id] || 0); }
    return t;
  }, [rows, types]);

  const th = (key, label) => (
    <th className="px-2 py-2 text-right cursor-pointer select-none whitespace-nowrap" onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : 1 }))}>
      {label}{sort.key === key ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}
    </th>
  );

  const text = () => {
    const L = [`*${settings.businessName} — Jar Report*`, ''];
    for (const r of rows) L.push(`${r.name}: ${types.map((j) => `${(r.p.jarBalance || {})[j.id] || 0} ${j.name}`).join(', ')} | Dep ${money(r.deposit)}`);
    L.push('', `*Total*: ${types.map((j) => `${totals.by[j.id] || 0} ${j.name}`).join(', ')} | Dep ${money(totals.deposit)}`);
    return L.join('\n');
  };
  async function excel() {
    const XLSX = await import('xlsx');
    const aoa = [['Party', ...types.map((j) => j.name), 'Total jars', 'Deposit'],
      ...rows.map((r) => [r.name, ...types.map((j) => (r.p.jarBalance || {})[j.id] || 0), r.total, Number(fromPaise(r.deposit))]),
      ['TOTAL', ...types.map((j) => totals.by[j.id] || 0), totals.total, Number(fromPaise(totals.deposit))]];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Jar report');
    XLSX.writeFile(wb, 'jar-report.xlsx');
  }

  return (
    <Page title="Jar Report" back="/reports" narrow={false}>
      {!rows.length ? <Empty>Kisi party ke paas jar ya deposit nahi hai</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>{th('name', 'Party')}{types.map((j) => th(j.id, j.name))}{th('total', 'Total')}{th('deposit', 'Deposit')}</tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.p.id} className="border-t border-slate-100">
                  <td className="px-2 py-2 font-medium text-left">{r.name}</td>
                  {types.map((j) => <td key={j.id} className={`px-2 py-2 text-right ${((r.p.jarBalance || {})[j.id] || 0) < 0 ? 'text-red-600' : ''}`}>{(r.p.jarBalance || {})[j.id] || 0}</td>)}
                  <td className="px-2 py-2 text-right font-semibold">{r.total}</td>
                  <td className="px-2 py-2 text-right">{money(r.deposit)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                <td className="px-2 py-2">Total</td>
                {types.map((j) => <td key={j.id} className="px-2 py-2 text-right">{totals.by[j.id] || 0}</td>)}
                <td className="px-2 py-2 text-right">{totals.total}</td>
                <td className="px-2 py-2 text-right">{money(totals.deposit)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <button className="btn" onClick={async () => { const r = await shareText(text(), 'Jar report'); if (r === 'copied') toast('Text copy ho gaya'); }}>📤 Text share</button>
        <button className="btn" onClick={excel}>📊 Excel</button>
      </div>
      <p className="text-xs text-slate-500">Yeh report sirf parties list se banti hai (extra reads nahi lagte). Header dabao to sort hoga.</p>
    </Page>
  );
}
