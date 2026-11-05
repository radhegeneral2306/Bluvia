import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, MagnifyingGlass, UsersThree, MapTrifold, Receipt, ArrowsClockwise } from '@phosphor-icons/react';
import { useStore } from '../data/store.jsx';
import { useT } from '../lib/i18n.js';
import { Page, Empty, Avatar, useToast } from '../components/ui.jsx';
import { dueView } from '../lib/advance.js';
import AreaFilter from '../components/AreaFilter.jsx';
import { listTxns } from '../data/api.js';
import { findLastBill } from '../lib/repeatBill.js';
import { jarsShort, sortParties, partyTotals, SORTS } from '../lib/partyRow.js';
import { areaOf, filterByArea, partyMatches, ALL_AREAS, NO_AREA } from '../lib/areas.js';

export default function Parties() {
  const { parties, money, jarTypes, isAdmin } = useStore();
  const { t } = useT();
  const nav = useNavigate();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [area, setArea] = useState(ALL_AREAS);
  const [sort, setSort] = useState('name');
  const [finding, setFinding] = useState('');
  const list = useMemo(
    () => sortParties(filterByArea(parties, area).filter((p) => (showInactive || p.active !== false) && partyMatches(p, q)), sort),
    [parties, q, showInactive, area, sort],
  );
  const totals = useMemo(() => partyTotals(list), [list]);
  const areaLabel = area === NO_AREA ? t('partyrow.noArea') : area;

  // Looks up the last bill only when "Repeat" is tapped (no per-row queries).
  async function repeat(p) {
    if (finding) return;
    setFinding(p.id);
    try {
      let cur = null; let more = true; let acc = [];
      for (let i = 0; i < 4 && more && !findLastBill(acc); i += 1) {
        const r = await listTxns({ partyId: p.id, after: cur });
        acc = [...acc, ...r.items]; cur = r.last; more = r.hasMore;
      }
      const found = findLastBill(acc);
      if (found) nav(`/bill/new?party=${p.id}&repeat=${found.id}`);
      else toast(t('parties.noBillYet'), 'warn');
    } catch (e) { toast(t('parties.findFailed', { msg: e.message }), 'err', 6000); } finally { setFinding(''); }
  }

  return (
    <Page title={t('parties.title')} actions={(
      <div className="flex items-center gap-2">
        <Link to="/map" aria-label={t('parties.mapAria')} className="btn btn-sm !min-h-[44px] !w-11 !px-0"><MapTrifold size={20} /></Link>
        {isAdmin && <Link to="/party/new" className="btn btn-primary btn-sm !min-h-[44px]"><Plus size={18} weight="bold" />{t('parties.add')}</Link>}
      </div>
    )} narrow={false}>
      <div className="flex items-center justify-between text-sm text-slate-600 gap-3">
        <span>{t('parties.count', { n: totals.count })}</span>
        <span>{t('parties.totalDue', { amount: '' })}<b className="num text-red-600">{money(totals.due)}</b></span>
      </div>
      <div className="relative">
        <MagnifyingGlass size={20} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input className="input !pl-11" placeholder={t('parties.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('parties.searchAria')} />
      </div>
      <AreaFilter parties={parties} value={area} onChange={setArea} />
      <div className="flex items-center gap-2 flex-wrap">
        {SORTS.map(([k]) => (
          <button key={k} type="button" aria-pressed={sort === k} onClick={() => setSort(k)}
            className={`min-h-[44px] px-4 rounded-full border text-sm font-medium ${sort === k ? 'bg-brand-50 text-brand-700 border-brand-500' : 'bg-surface text-slate-700 border-slate-200 active:bg-slate-100'}`}>{t(`partyrow.sort.${k}`)}</button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-600 min-h-[44px]"><input type="checkbox" className="w-5 h-5" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> {t('parties.showInactive')}</label>
      {!list.length && (
        <Empty icon={UsersThree} title={parties.length ? t('parties.empty.none') : t('parties.empty.zero')}
          action={!parties.length && isAdmin && <Link to="/party/new" className="btn btn-primary btn-sm">{t('parties.addFirst')}</Link>}>
          {parties.length ? (area ? t('parties.empty.inArea', { area: areaLabel }) : t('parties.empty.try')) : (isAdmin ? t('parties.empty.adminHint') : t('parties.empty.staffHint'))}
        </Empty>
      )}
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {list.map((p) => {
          const o = p.outstanding || 0;
          const jars = jarsShort(p.jarBalance, jarTypes);
          return (
            <div key={p.id} className="card p-3 min-w-0">
              <Link to={`/party/${p.id}`} className="flex items-center gap-3 min-h-[64px] min-w-0 active:bg-slate-100 transition-colors rounded-lg">
                <Avatar name={p.name} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{p.name}</div>
                  <div className="text-xs text-slate-500 truncate">{areaOf(p) || t('partyrow.noArea')}{p.active === false ? `, ${t('parties.inactive')}` : ''}</div>
                  <div className="text-xs text-slate-600 truncate">{t('parties.jars', { list: jars || t('parties.jarsNone') })}</div>
                </div>
                <div className="text-right shrink-0 max-w-[45%]">
                  <div className={`font-bold text-lg num break-words ${o === 0 ? 'text-slate-500' : dueView(o).tone}`}>{o < 0 ? t('parties.advance', { amount: money(-o) }) : money(o)}</div>
                  {!!p.depositBalance && <div className="text-xs text-slate-500 num">{t('parties.dep', { amount: money(p.depositBalance) })}</div>}
                </div>
              </Link>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Link to={`/bill/new?party=${p.id}`} className="btn btn-primary btn-sm !min-h-[44px]"><Receipt size={18} />{t('parties.bill')}</Link>
                <button type="button" className="btn btn-sm !min-h-[44px]" disabled={!!finding} onClick={() => repeat(p)}><ArrowsClockwise size={18} />{finding === p.id ? t('parties.finding') : t('parties.repeat')}</button>
              </div>
            </div>
          );
        })}
      </div>
    </Page>
  );
}
