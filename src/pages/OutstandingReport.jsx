import { useMemo, useState } from 'react';
import { ShareNetwork, FileXls, WhatsappLogo, CheckCircle } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { useStore } from '../data/store.jsx';
import { useT } from '../lib/i18n.js';
import { Page, Empty, useToast } from '../components/ui.jsx';
import { reminderText, waLink, shareText } from '../lib/share.js';
import { fromPaise } from '../lib/money.js';
import AreaFilter from '../components/AreaFilter.jsx';
import { areaOf, filterByArea, ALL_AREAS, NO_AREA } from '../lib/areas.js';

export default function OutstandingReport() {
  const { parties, money, settings, jarName } = useStore();
  const { t } = useT();
  const toast = useToast();
  const [area, setArea] = useState(ALL_AREAS);
  const scoped = useMemo(() => filterByArea(parties, area), [parties, area]);
  const areaLabel = area === NO_AREA ? t('partyrow.noArea') : area;
  const rows = useMemo(() => scoped.filter((p) => (p.outstanding || 0) > 0).sort((a, b) => b.outstanding - a.outstanding), [scoped]);
  const total = rows.reduce((s, p) => s + p.outstanding, 0);
  const advRows = useMemo(() => scoped.filter((p) => (p.outstanding || 0) < 0).sort((a, b) => a.outstanding - b.outstanding), [scoped]);
  const advTotal = advRows.reduce((s, p) => s - p.outstanding, 0);

  async function excel() {
    const XLSX = await import('xlsx');
    const aoa = [[t('outst.xl.party'), t('outst.xl.area'), t('outst.xl.phone'), t('outst.xl.outstanding')], ...rows.map((p) => [p.name, areaOf(p), p.phone || '', Number(fromPaise(p.outstanding))]), [t('outst.xl.total'), '', '', Number(fromPaise(total))]];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Outstanding');
    XLSX.writeFile(wb, 'outstanding.xlsx');
  }
  const listText = [`*${settings.businessName}: ${t('outst.listTitle')}${area ? ` (${areaLabel})` : ''}*`, '', ...rows.map((p, i) => `${i + 1}. ${p.name}${areaOf(p) ? ` (${areaOf(p)})` : ''}: ${money(p.outstanding)}`), '', `*${t('outst.listTotal')}: ${money(total)}*`].join('\n');

  return (
    <Page title={t('outst.title')} back="/reports">
      <AreaFilter parties={parties} value={area} onChange={setArea} />
      <div className="card px-4 py-3 flex items-baseline justify-between gap-3">
        <span className="text-sm text-slate-600">{t('outst.total', { n: rows.length, unit: rows.length === 1 ? t('outst.unit.one') : t('outst.unit.many'), area: area ? `, ${areaLabel}` : '' })}</span>
        <b className="text-xl text-red-600 num">{money(total)}</b>
      </div>
      {!rows.length ? <Empty icon={CheckCircle} title={area ? t('outst.emptyTitleArea') : t('outst.emptyTitle')}>{area ? t('outst.emptyArea', { area: areaLabel }) : t('outst.empty')}</Empty> : (
        <div className="card divide-y divide-slate-100 overflow-hidden">
          {rows.map((p) => (
            <div key={p.id} className="px-4 min-h-[68px] py-2 flex items-center gap-3 min-w-0">
              <Link to={`/party/${p.id}`} className="flex-1 min-w-0">
                <div className="font-semibold truncate">{p.name}</div>
                <div className="text-xs text-slate-500 num truncate">{areaOf(p) ? `${areaOf(p)}, ` : ''}{p.phone || t('outst.noPhone')}</div>
              </Link>
              <div className="font-bold text-red-600 num shrink-0">{money(p.outstanding)}</div>
              <a className={`btn btn-sm shrink-0 ${p.phone ? '' : 'opacity-40 pointer-events-none'}`} target="_blank" rel="noreferrer"
                href={waLink(p.phone, reminderText({ party: p, settings, jarName, money }), settings.countryCode)}><WhatsappLogo size={20} />{t('outst.remind')}</a>
            </div>
          ))}
        </div>
      )}
      {advRows.length > 0 && (
        <section className="space-y-2" aria-label={t('outst.advanceAria')}>
          <div className="flex items-baseline justify-between gap-3 px-1">
            <h2 className="font-semibold">{t('outst.advanceHeading')}</h2>
            <span className="text-sm text-emerald-600 font-semibold num shrink-0">{money(advTotal)}</span>
          </div>
          <div className="card divide-y divide-slate-100 overflow-hidden">
            {advRows.map((p) => (
              <Link key={p.id} to={`/party/${p.id}`} className="px-4 min-h-[56px] py-2 flex items-center gap-3 min-w-0 active:bg-slate-100">
                <span className="flex-1 min-w-0"><span className="block font-medium truncate">{p.name}</span>{areaOf(p) && <span className="block text-xs text-slate-500 truncate">{areaOf(p)}</span>}</span>
                <span className="text-emerald-600 font-semibold num shrink-0">{t('outst.advance', { amount: money(-p.outstanding) })}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
      <div className="grid grid-cols-1 min-[340px]:grid-cols-2 gap-3">
        <button className="btn" onClick={async () => { const r = await shareText(listText, t('outst.shareTitle')); if (r === 'copied') toast(t('outst.copied')); }}><ShareNetwork size={20} />{t('outst.shareText')}</button>
        <button className="btn" onClick={excel}><FileXls size={20} />{t('outst.excel')}</button>
      </div>
    </Page>
  );
}
