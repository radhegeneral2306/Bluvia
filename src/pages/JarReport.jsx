import { useMemo, useState } from 'react';
import { ShareNetwork, FileXls, CaretUp, CaretDown, Drop } from '@phosphor-icons/react';
import { useStore } from '../data/store.jsx';
import { useT } from '../lib/i18n.js';
import { Page, Empty, useToast } from '../components/ui.jsx';
import { shareText } from '../lib/share.js';
import { fromPaise } from '../lib/money.js';
import { downloadBlob } from '../lib/backup.js';
import AreaFilter from '../components/AreaFilter.jsx';
import { areaOf, filterByArea, ALL_AREAS, NO_AREA } from '../lib/areas.js';

export default function JarReport() {
  const { parties, jarTypes, money, settings } = useStore();
  const { t } = useT();
  const toast = useToast();
  const [sort, setSort] = useState({ key: 'name', dir: 1 });
  const [area, setArea] = useState(ALL_AREAS);
  const areaLabel = area === NO_AREA ? t('partyrow.noArea') : area;
  const types = jarTypes.filter((j) => j.active !== false || parties.some((p) => (p.jarBalance || {})[j.id]));

  const rows = useMemo(() => {
    const r = filterByArea(parties, area)
      .filter((p) => Object.values(p.jarBalance || {}).some(Boolean) || p.depositBalance)
      .map((p) => ({ p, name: p.name, deposit: p.depositBalance || 0, total: Object.values(p.jarBalance || {}).reduce((a, b) => a + b, 0) }));
    const val = (x) => (sort.key === 'name' ? x.name.toLowerCase() : sort.key === 'area' ? areaOf(x.p).toLowerCase() : sort.key === 'deposit' ? x.deposit : sort.key === 'total' ? x.total : (x.p.jarBalance || {})[sort.key] || 0);
    return r.sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sort.dir);
  }, [parties, sort, area]);
  const showArea = rows.some((r) => areaOf(r.p)) || parties.some((p) => areaOf(p));

  const totals = useMemo(() => {
    const t = { deposit: 0, total: 0, by: {} };
    for (const r of rows) { t.deposit += r.deposit; t.total += r.total; for (const j of types) t.by[j.id] = (t.by[j.id] || 0) + ((r.p.jarBalance || {})[j.id] || 0); }
    return t;
  }, [rows, types]);

  const th = (key, label) => (
    <th key={key} className={`${key === 'name' ? 'sticky left-0 z-10 bg-slate-100 max-w-[8.5rem]' : ''} px-3 py-2.5 cursor-pointer select-none whitespace-nowrap text-xs font-semibold uppercase tracking-wide ${key === 'name' || key === 'area' ? 'text-left' : 'text-right'} ${sort.key === key ? 'text-brand-700' : ''}`} onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : 1 }))} aria-sort={sort.key === key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
      <span className="inline-flex items-center gap-1">{label}{sort.key === key && (sort.dir > 0 ? <CaretUp size={12} weight="bold" /> : <CaretDown size={12} weight="bold" />)}</span>
    </th>
  );

  const text = () => {
    const L = [`*${settings.businessName}: ${t('jarrep.title')}${area ? ` (${areaLabel})` : ''}*`, ''];
    for (const r of rows) L.push(`${r.name}${areaOf(r.p) ? ` (${areaOf(r.p)})` : ''}: ${types.map((j) => `${(r.p.jarBalance || {})[j.id] || 0} ${j.name}`).join(', ')} | ${t('jarrep.dep', { amount: money(r.deposit) })}`);
    L.push('', `*${t('jarrep.total')}*: ${types.map((j) => `${totals.by[j.id] || 0} ${j.name}`).join(', ')} | ${t('jarrep.dep', { amount: money(totals.deposit) })}`);
    return L.join('\n');
  };
  async function excel() {
    const XLSX = await import('xlsx');
    const aoa = [[t('jarrep.col.party'), t('jarrep.col.area'), ...types.map((j) => j.name), t('jarrep.xl.totalJars'), t('jarrep.col.deposit')],
      ...rows.map((r) => [r.name, areaOf(r.p), ...types.map((j) => (r.p.jarBalance || {})[j.id] || 0), r.total, Number(fromPaise(r.deposit))]),
      [t('jarrep.xl.total'), '', ...types.map((j) => totals.by[j.id] || 0), totals.total, Number(fromPaise(totals.deposit))]];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), t('jarrep.xl.sheet'));
    XLSX.writeFile(wb, 'jar-report.xlsx');
  }

  return (
    <Page title={t('jarrep.title')} back="/reports" narrow={false}>
      <AreaFilter parties={parties} value={area} onChange={setArea} />
      {!rows.length ? <Empty icon={Drop} title={area ? t('jarrep.emptyTitleArea') : t('jarrep.emptyTitle')}>{area ? t('jarrep.emptyArea', { area: areaLabel }) : t('jarrep.empty')}</Empty> : (
        <>
        <p className="sm:hidden text-xs text-slate-500 px-1">{t('jarrep.scrollHint')}</p>
        <div className="relative">
        <div className="card overflow-x-auto" tabIndex={0} role="region" aria-label={t('jarrep.tableAria')}>
          <table className="w-full text-sm num">
            <thead className="bg-slate-100 text-slate-600 sticky top-0">
              <tr>{th('name', t('jarrep.col.party'))}{showArea && th('area', t('jarrep.col.area'))}{types.map((j) => th(j.id, j.name))}{th('total', t('jarrep.col.total'))}{th('deposit', t('jarrep.col.deposit'))}</tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.p.id} className="border-t border-slate-100">
                  <td className="sticky left-0 z-10 bg-surface px-3 py-3 font-medium text-left max-w-[8.5rem] truncate" title={r.name}>{r.name}</td>
                  {showArea && <td className="px-3 py-3 text-left text-slate-600 whitespace-nowrap max-w-[9rem] truncate">{areaOf(r.p) || '-'}</td>}
                  {types.map((j) => <td key={j.id} className={`px-3 py-3 text-right ${((r.p.jarBalance || {})[j.id] || 0) < 0 ? 'text-red-600' : ''}`}>{(r.p.jarBalance || {})[j.id] || 0}</td>)}
                  <td className="px-3 py-3 text-right font-semibold">{r.total}</td>
                  <td className="px-3 py-3 text-right">{money(r.deposit)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-300 bg-brand-50 text-brand-900 font-bold">
                <td className="sticky left-0 z-10 bg-brand-50 px-3 py-3">{t('jarrep.total')}</td>
                {showArea && <td className="px-3 py-3" />}
                {types.map((j) => <td key={j.id} className="px-3 py-3 text-right">{totals.by[j.id] || 0}</td>)}
                <td className="px-3 py-3 text-right">{totals.total}</td>
                <td className="px-3 py-3 text-right">{money(totals.deposit)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="pointer-events-none absolute right-px top-px bottom-px w-6 rounded-r-2xl bg-gradient-to-l from-surface to-transparent sm:hidden" aria-hidden />
        </div>
        </>
      )}
      <div className="grid grid-cols-1 min-[340px]:grid-cols-2 gap-3">
        <button className="btn" onClick={async () => { const r = await shareText(text(), t('jarrep.shareTitle')); if (r === 'copied') toast(t('jarrep.copied')); }}><ShareNetwork size={20} />{t('jarrep.shareText')}</button>
        <button className="btn" onClick={excel}><FileXls size={20} />{t('jarrep.excel')}</button>
      </div>
      <p className="text-xs text-slate-500">{t('jarrep.footer')}</p>
    </Page>
  );
}
