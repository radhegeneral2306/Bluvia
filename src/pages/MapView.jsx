import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Crosshair, MapPin, NavigationArrow, Phone, WhatsappLogo, CheckCircle, Warning, ArrowClockwise } from '@phosphor-icons/react';
import { useStore } from '../data/store.jsx';
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
    catch (e) { setLocErr(e.message || 'Location nahi mil payi.'); }
    finally { setLocating(false); }
  }

  const jarsText = (p) => Object.entries(p.jarBalance || {}).filter(([, n]) => n).map(([id, n]) => `${n} x ${jarName(id)}`).join(', ');
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Page title="Map" back="/parties" narrow={false}>
      <AreaFilter parties={active} value={area} onChange={setArea} />
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-600 num" aria-live="polite">{located.length} {located.length === 1 ? 'party' : 'parties'} map par</p>
        <button type="button" aria-pressed={dueOnly} onClick={() => setDueOnly((v) => !v)}
          className={`inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-full border text-sm font-medium transition-colors ${dueOnly ? 'bg-brand-50 text-brand-700 border-brand-500' : 'bg-surface text-slate-700 border-slate-200 active:bg-slate-100'}`}>
          Sirf baaki wali
        </button>
      </div>
      <Tabs tabs={[['map', 'Map'], ['near', 'Paas ki list'], ['missing', 'Bina location']]} value={tab} onChange={setTab} />

      {tab === 'map' && (
        <div className="space-y-3">
          {located.length === 0 ? (
            <Empty icon={MapPin} title={anyLocated ? 'Is filter mein koi party map par nahi' : 'Abhi koi party map par nahi'}
              action={(
                <div className="flex flex-wrap gap-2 justify-center">
                  <button type="button" className="btn btn-primary btn-sm !min-h-[44px]" onClick={() => setTab('missing')}>Bina location wali dekho</button>
                  <Link to="/parties" className="btn btn-sm !min-h-[44px]">Parties</Link>
                </div>
              )}>
              {anyLocated ? 'Area ya "Sirf baaki wali" filter badal kar dekho.' : 'Party ke page par Location lo dabao.'}
            </Empty>
          ) : (
            <>
              <PartyMap parties={located} selectedId={selectedId} onSelect={(id) => pick(id)} here={here} fitKey={`${area}|${dueOnly}|${located.length}`} focusId={focusId} />
              <p className="text-xs text-slate-500">Map internet se aata hai. Lal = baaki, hara = advance, grey = hisaab barabar.</p>
            </>
          )}

          {selected && (
            <section className="card p-4 space-y-3" aria-label="Party ki detail">
              <div className="flex items-start gap-3">
                <Avatar name={selected.name} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold break-words">{selected.name}</div>
                  <div className="text-xs text-slate-500 break-words">{[areaOf(selected), selected.phone].filter(Boolean).join(', ') || 'No area, no phone'}</div>
                </div>
                <div className={`text-right font-semibold num shrink-0 ${dueView(selected.outstanding).tone}`}>
                  <div className="text-xs font-medium text-slate-500">{dueView(selected.outstanding).label}</div>
                  {money(dueView(selected.outstanding).amount)}
                </div>
              </div>
              {jarsText(selected) && <p className="text-sm text-slate-600">Jars party ke paas: <span className="font-medium text-slate-800 num">{jarsText(selected)}</span></p>}
              {!hasLocation(selected) && <p className="text-sm text-amber-700 flex items-center gap-1.5"><Warning size={18} />Is party ki location abhi nahi hai.</p>}
              <div className="flex flex-wrap gap-2">
                {hasLocation(selected) && (
                  <a className="btn btn-primary btn-sm !min-h-[44px]" href={navUrls(selected.lat, selected.lng).google} target="_blank" rel="noopener noreferrer">
                    <NavigationArrow size={18} weight="fill" />Navigate
                  </a>
                )}
                {hasLocation(selected) && isIOS() && (
                  <a className="btn btn-sm !min-h-[44px]" href={navUrls(selected.lat, selected.lng).apple} target="_blank" rel="noopener noreferrer">Apple Maps</a>
                )}
                {selected.phone && <a className="btn btn-sm !min-h-[44px]" href={`tel:${selected.phone}`}><Phone size={18} />Call</a>}
                {selected.phone && <a className="btn btn-sm !min-h-[44px]" href={waLink(selected.phone, '', settings.countryCode)} target="_blank" rel="noopener noreferrer"><WhatsappLogo size={18} />WhatsApp</a>}
                <Link className="btn btn-sm !min-h-[44px]" to={`/party/${selected.id}`}>Party kholo</Link>
                <Link className="btn btn-sm !min-h-[44px]" to={`/bill/new?party=${selected.id}`}>Naya bill</Link>
                <Link className="btn btn-sm !min-h-[44px]" to={`/entry/new/receipt?party=${selected.id}`}>Receipt</Link>
              </div>
            </section>
          )}
        </div>
      )}

      {tab === 'near' && (
        <div className="space-y-3">
          <div className="card p-4 space-y-3">
            <p className="text-sm text-slate-600">Apni location lo, phir parties sabse paas wali pehle dikhengi.</p>
            <button type="button" className="btn btn-primary !min-h-[48px]" onClick={findMe} disabled={locating}>
              {here && !locating ? <ArrowClockwise size={20} /> : <Crosshair size={20} />}
              {locating ? 'Location le raha hai...' : here ? 'Dobara location lo' : 'Meri location lo'}
            </button>
            {locErr && (
              <p className="text-sm text-red-600 flex items-start gap-1.5" role="alert"><Warning size={18} className="shrink-0 mt-0.5" />{locErr}</p>
            )}
          </div>
          {here && nearest.length === 0 && <Empty icon={MapPin} title="Is filter mein location wali party nahi">Area ya "Sirf baaki wali" filter badal kar dekho.</Empty>}
          <ul className="space-y-2">
            {nearest.map(({ party: p, meters }) => (
              <li key={p.id}>
                <button type="button" onClick={() => pick(p.id, true)} className="card w-full p-3 flex items-center gap-3 min-h-[64px] text-left active:bg-slate-100 transition-colors">
                  <Avatar name={p.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold truncate">{p.name}</span>
                    <span className="block text-xs text-slate-500 truncate">{areaOf(p) || 'No area'}</span>
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block font-semibold num">{formatDistance(meters)}</span>
                    <span className={`block text-xs num ${dueView(p.outstanding).tone}`}>{dueView(p.outstanding).label} {money(dueView(p.outstanding).amount)}</span>
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
            <Empty icon={MapPin} title="Koi party nahi">Is area mein abhi koi active party nahi hai.</Empty>
          ) : (
            <>
              <div className="card p-4 space-y-2">
                <p className="font-semibold num">{progress.done} / {progress.total} parties ki location ho gayi</p>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Location progress">
                  <div className="h-2 rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
                </div>
              </div>
              {progress.missing.length === 0 ? (
                <div className="card p-4 flex items-center gap-3 text-emerald-700">
                  <CheckCircle size={24} weight="fill" /><span className="font-medium">Sab parties ki location ho gayi.</span>
                </div>
              ) : (
                <ul className="space-y-2">
                  {progress.missing.map((p) => (
                    <li key={p.id}>
                      <Link to={`/party/${p.id}`} className="card p-3 flex items-center gap-3 min-h-[64px] active:bg-slate-100 transition-colors">
                        <Avatar name={p.name} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold truncate">{p.name}</span>
                          <span className="block text-xs text-slate-500 truncate">{[areaOf(p), p.phone].filter(Boolean).join(', ') || 'No area, no phone'}</span>
                        </span>
                        <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-brand-700"><Crosshair size={16} />Location lo</span>
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
