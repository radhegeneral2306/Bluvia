import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Crosshair, MapPin, NavigationArrow, Phone, WhatsappLogo, CheckCircle, Warning, ArrowClockwise } from '@phosphor-icons/react';
import { useStore } from '../data/store.jsx';
import { useT } from '../lib/i18n.js';
import { Page, Tabs, Empty, Avatar } from '../components/ui.jsx';
import AreaFilter from '../components/AreaFilter.jsx';
import PartyMap from '../components/PartyMap.jsx';
import { areaOf, filterByArea, ALL_AREAS } from '../lib/areas.js';
import { hasLocation, nearestParties, locationProgress, formatDistance, navUrls } from '../lib/geo.js';
import { getBestPosition } from '../lib/gps.js';
import { dueView } from '../lib/advance.js';
import { waLink } from '../lib/share.js';
import { isIOS } from '../lib/pwa.js';

export default function MapView() {
  const { parties, partyMap, settings, money, jarName } = useStore();
  const { t } = useT();
  const [sp] = useSearchParams();
  const focusParam = sp.get('focus') || '';
  const [tab, setTab] = useState('map');
  const [area, setArea] = useState(ALL_AREAS);
  const [dueOnly, setDueOnly] = useState(false);
  const [selectedId, setSelectedId] = useState(partyMap[focusParam] ? focusParam : '');
  const [focusId, setFocusId] = useState(partyMap[focusParam] ? focusParam : '');
  const [here, setHere] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locErr, setLocErr] = useState('');

  const active = useMemo(() => parties.filter((p) => p.active !== false), [parties]);
  const inArea = useMemo(() => filterByArea(active, area), [active, area]);
  const located = useMemo(() => inArea.filter(hasLocation).filter((p) => !dueOnly || (p.outstanding || 0) > 0), [inArea, dueOnly]);
  const anyLocated = useMemo(() => active.some(hasLocation), [active]);
  const progress = useMemo(() => locationProgress(inArea), [inArea]);
  const nearest = useMemo(() => nearestParties(located, here, 100), [located, here]);
  const selected = selectedId ? partyMap[selectedId] : null;

  const pick = (id, zoom = false) => { setSelectedId(id); if (zoom) { setFocusId(id); setTab('map'); } };

  async function findMe() {
    setLocating(true); setLocErr('');
    try { setHere(await getBestPosition({ maxMs: 8000, goodEnough: 50 })); }
    catch (e) { setLocErr(e.message || t('map.locFailed')); }
    finally { setLocating(false); }
  }

  const jarsText = (p) => Object.entries(p.jarBalance || {}).filter(([, n]) => n).map(([id, n]) => `${n} x ${jarName(id)}`).join(', ');
  const dueLabel = (o) => (o < 0 ? t('partyrow.advance') : t('word.baaki'));
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Page title={t('map.title')} back="/parties" narrow={false}>
      <AreaFilter parties={active} value={area} onChange={setArea} />
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-600 num" aria-live="polite">{t(located.length === 1 ? 'map.count.one' : 'map.count.many', { n: located.length })}</p>
        <button type="button" aria-pressed={dueOnly} onClick={() => setDueOnly((v) => !v)}
          className={`inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-full border text-sm font-medium transition-colors ${dueOnly ? 'bg-brand-50 text-brand-700 border-brand-500' : 'bg-surface text-slate-700 border-slate-200 active:bg-slate-100'}`}>
          {t('map.dueOnly')}
        </button>
      </div>
      <Tabs tabs={[['map', t('map.tab.map')], ['near', t('map.tab.near')], ['missing', t('map.tab.missing')]]} value={tab} onChange={setTab} />

      {tab === 'map' && (
        <div className="space-y-3">
          {located.length === 0 ? (
            <Empty icon={MapPin} title={anyLocated ? t('map.empty.filter') : t('map.empty.none')}
              action={(
                <div className="flex flex-wrap gap-2 justify-center">
                  <button type="button" className="btn btn-primary btn-sm !min-h-[44px]" onClick={() => setTab('missing')}>{t('map.seeMissing')}</button>
                  <Link to="/parties" className="btn btn-sm !min-h-[44px]">{t('map.partiesBtn')}</Link>
                </div>
              )}>
              {anyLocated ? t('map.empty.filterHint') : t('map.empty.noneHint')}
            </Empty>
          ) : (
            <>
              <PartyMap parties={located} selectedId={selectedId} onSelect={(id) => pick(id)} here={here} t={t} fitKey={`${area}|${dueOnly}|${located.length}`} focusId={focusId} />
              <p className="text-xs text-slate-500">{t('map.legend')}</p>
            </>
          )}

          {selected && (
            <section className="card p-4 space-y-3" aria-label={t('map.detailAria')}>
              <div className="flex items-start gap-3">
                <Avatar name={selected.name} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold break-words">{selected.name}</div>
                  <div className="text-xs text-slate-500 break-words">{[areaOf(selected), selected.phone].filter(Boolean).join(', ') || t('partyrow.noAreaNoPhone')}</div>
                </div>
                <div className={`text-right font-semibold num shrink-0 ${dueView(selected.outstanding).tone}`}>
                  <div className="text-xs font-medium text-slate-500">{dueLabel(selected.outstanding)}</div>
                  {money(dueView(selected.outstanding).amount)}
                </div>
              </div>
              {jarsText(selected) && <p className="text-sm text-slate-600">{t('map.jarsWithParty')}<span className="font-medium text-slate-800 num">{jarsText(selected)}</span></p>}
              {!hasLocation(selected) && <p className="text-sm text-amber-700 flex items-center gap-1.5"><Warning size={18} />{t('map.noLocationYet')}</p>}
              <div className="flex flex-wrap gap-2">
                {hasLocation(selected) && (
                  <a className="btn btn-primary btn-sm !min-h-[44px]" href={navUrls(selected.lat, selected.lng).google} target="_blank" rel="noopener noreferrer">
                    <NavigationArrow size={18} weight="fill" />{t('map.navigate')}
                  </a>
                )}
                {hasLocation(selected) && isIOS() && (
                  <a className="btn btn-sm !min-h-[44px]" href={navUrls(selected.lat, selected.lng).apple} target="_blank" rel="noopener noreferrer">{t('map.appleMaps')}</a>
                )}
                {selected.phone && <a className="btn btn-sm !min-h-[44px]" href={`tel:${selected.phone}`}><Phone size={18} />{t('map.call')}</a>}
                {selected.phone && <a className="btn btn-sm !min-h-[44px]" href={waLink(selected.phone, '', settings.countryCode)} target="_blank" rel="noopener noreferrer"><WhatsappLogo size={18} />WhatsApp</a>}
                <Link className="btn btn-sm !min-h-[44px]" to={`/party/${selected.id}`}>{t('map.openParty')}</Link>
                <Link className="btn btn-sm !min-h-[44px]" to={`/bill/new?party=${selected.id}`}>{t('map.newBill')}</Link>
                <Link className="btn btn-sm !min-h-[44px]" to={`/entry/new/receipt?party=${selected.id}`}>{t('map.receipt')}</Link>
              </div>
            </section>
          )}
        </div>
      )}

      {tab === 'near' && (
        <div className="space-y-3">
          <div className="card p-4 space-y-3">
            <p className="text-sm text-slate-600">{t('map.nearHint')}</p>
            <button type="button" className="btn btn-primary !min-h-[48px]" onClick={findMe} disabled={locating}>
              {here && !locating ? <ArrowClockwise size={20} /> : <Crosshair size={20} />}
              {locating ? t('map.locating') : here ? t('map.locateAgain') : t('map.locateMe')}
            </button>
            {locErr && (
              <p className="text-sm text-red-600 flex items-start gap-1.5" role="alert"><Warning size={18} className="shrink-0 mt-0.5" />{locErr}</p>
            )}
          </div>
          {here && nearest.length === 0 && <Empty icon={MapPin} title={t('map.near.emptyTitle')}>{t('map.empty.filterHint')}</Empty>}
          <ul className="space-y-2">
            {nearest.map(({ party: p, meters }) => (
              <li key={p.id}>
                <button type="button" onClick={() => pick(p.id, true)} className="card w-full p-3 flex items-center gap-3 min-h-[64px] text-left active:bg-slate-100 transition-colors">
                  <Avatar name={p.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold truncate">{p.name}</span>
                    <span className="block text-xs text-slate-500 truncate">{areaOf(p) || t('partyrow.noArea')}</span>
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block font-semibold num">{formatDistance(meters)}</span>
                    <span className={`block text-xs num ${dueView(p.outstanding).tone}`}>{dueLabel(p.outstanding)} {money(dueView(p.outstanding).amount)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'missing' && (
        <div className="space-y-3">
          {progress.total === 0 ? (
            <Empty icon={MapPin} title={t('map.missing.noneTitle')}>{t('map.missing.noneHint')}</Empty>
          ) : (
            <>
              <div className="card p-4 space-y-2">
                <p className="font-semibold num">{t('map.progress', { done: progress.done, total: progress.total })}</p>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t('map.progressAria')}>
                  <div className="h-2 rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
                </div>
              </div>
              {progress.missing.length === 0 ? (
                <div className="card p-4 flex items-center gap-3 text-emerald-700">
                  <CheckCircle size={24} weight="fill" /><span className="font-medium">{t('map.allDone')}</span>
                </div>
              ) : (
                <ul className="space-y-2">
                  {progress.missing.map((p) => (
                    <li key={p.id}>
                      <Link to={`/party/${p.id}`} className="card p-3 flex items-center gap-3 min-h-[64px] active:bg-slate-100 transition-colors">
                        <Avatar name={p.name} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold truncate">{p.name}</span>
                          <span className="block text-xs text-slate-500 truncate">{[areaOf(p), p.phone].filter(Boolean).join(', ') || t('partyrow.noAreaNoPhone')}</span>
                        </span>
                        <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-brand-700"><Crosshair size={16} />{t('map.getLocation')}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </Page>
  );
}
