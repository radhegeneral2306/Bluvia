import { useStore } from '../data/store.jsx';
import { useT } from '../lib/i18n.js';
import { areaList, strayAreas, areaCounts, filterByArea, NO_AREA, ALL_AREAS } from '../lib/areas.js';

/** Row of area filter chips. value: ALL_AREAS ('') | NO_AREA | an area name. Hidden when there is nothing to filter by. */
export default function AreaFilter({ parties, value, onChange }) {
  const { settings } = useStore();
  const { t } = useT();
  const list = areaList(settings);
  const stray = strayAreas(list, parties);
  const none = areaCounts(parties).none;
  const areas = [...list, ...stray];
  if (!areas.length) return null; // no area is set on any party and the admin list is empty

  const chips = [
    { key: 'all', value: ALL_AREAS, label: t('areafilter.all'), count: parties.length },
    ...areas.map((a) => ({ key: `a:${a}`, value: a, label: a, count: filterByArea(parties, a).length })),
    ...(none > 0 ? [{ key: 'none', value: NO_AREA, label: t('areafilter.none'), count: none }] : []),
  ];

  return (
    <div role="group" aria-label={t('areafilter.label')} className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1">
      {chips.map((c) => {
        const on = value === c.value;
        return (
          <button key={c.key} type="button" aria-pressed={on} onClick={() => onChange(c.value)}
            className={`shrink-0 inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-full border text-sm font-medium whitespace-nowrap transition-colors ${on ? 'bg-brand-50 text-brand-700 border-brand-500' : 'bg-surface text-slate-700 border-slate-200 active:bg-slate-100'}`}>
            {c.label}<span className="text-xs num text-slate-500">{c.count}</span>
          </button>
        );
      })}
    </div>
  );
}
