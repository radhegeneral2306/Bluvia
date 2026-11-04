import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Crosshair, LinkSimple, NavigationArrow, MapTrifold, WarningCircle, CheckCircle, Warning } from '@phosphor-icons/react';
import { Modal, Field, useToast } from './ui.jsx';
import { saveLocation } from '../data/api.js';
import { getBestPosition } from '../lib/gps.js';
import { dateKeyOf, fmtDate } from '../lib/dates.js';
import { accuracyLevel, formatDistance, hasLocation, haversineMeters, navUrls, parseMapsLink, FAR_MOVE_M } from '../lib/geo.js';

const IS_ADMIN = true; // staff roles come later: only the admin may change a saved location

const LEVEL = {
  good: { text: 'Bahut achha', cls: 'text-emerald-700', word: 'achha' },
  ok: { text: 'Theek hai (200 m tak chalta hai)', cls: 'text-amber-700', word: 'theek' },
  poor: { text: 'Bahut kharab, dobara try karo', cls: 'text-red-700', word: 'kharab' },
};

const isApple = () => {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

const fmt6 = (n) => Number(n).toFixed(6);
const savedDate = (ts) => {
  const d = ts && typeof ts.toDate === 'function' ? ts.toDate() : null;
  return d ? fmtDate(dateKeyOf(d)) : '';
};

/** Location of one party: save it once (GPS at the customer's door, or a pasted maps link), then navigate or see it on the map. */
export default function LocationCard({ party }) {
  const toast = useToast();
  const has = hasLocation(party);
  const [mode, setMode] = useState(null);           // null | 'gps' | 'link'
  const [phase, setPhase] = useState('idle');       // gps: 'searching' | 'result' | 'error'
  const [progress, setProgress] = useState(null);   // metres while searching
  const [result, setResult] = useState(null);       // { lat, lng, accuracy }
  const [error, setError] = useState('');
  const [farConfirm, setFarConfirm] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const run = useRef(0);

  const close = () => { run.current += 1; setMode(null); setPhase('idle'); setResult(null); setProgress(null); setError(''); setFarConfirm(false); setText(''); };

  const startGps = () => {
    const id = (run.current += 1);
    setMode('gps'); setPhase('searching'); setProgress(null); setResult(null); setError(''); setFarConfirm(false);
    getBestPosition({ maxMs: 12000, goodEnough: 25, onProgress: (p) => { if (run.current === id) setProgress(p.accuracy); } })
      .then((r) => { if (run.current === id) { setResult(r); setPhase('result'); } })
      .catch((e) => { if (run.current === id) { setError(e?.message || 'Location nahi mili.'); setPhase('error'); } });
  };
  const startLink = () => { run.current += 1; setMode('link'); setText(''); setFarConfirm(false); };

  const parsed = mode === 'link' ? parseMapsLink(text) : null;
  const target = mode === 'gps' ? result : parsed ? { ...parsed, accuracy: null } : null;
  const moved = has && target ? haversineMeters(party, target) : 0;
  const far = has && target && moved > FAR_MOVE_M;
  const level = mode === 'gps' && result ? accuracyLevel(result.accuracy) : null;

  async function save() {
    if (!target) return;
    if (far && !farConfirm) { setFarConfirm(true); return; }    // second, explicit tap needed when the point is far from the saved one
    setBusy(true);
    try {
      const st = await saveLocation(party.id, { lat: target.lat, lng: target.lng, accuracy: target.accuracy, source: mode === 'link' ? 'link' : 'gps' });
      toast(st === 'queued' ? 'Phone par save hua, internet aate hi sync hoga.' : 'Location save ho gayi.', st === 'queued' ? 'warn' : 'ok');
      close();
    } catch (e) { toast(e.message || 'Location save nahi hui.', 'err'); } finally { setBusy(false); }
  }

  const urls = has ? navUrls(party.lat, party.lng) : null;
  const acc = typeof party.locAccuracy === 'number' ? party.locAccuracy : null;
  const accLevel = acc === null ? null : accuracyLevel(acc);
  const when = savedDate(party.locUpdatedAt);

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 shrink-0 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center"><MapPin size={22} weight={has ? 'fill' : 'regular'} /></span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Location</div>
          {has ? (
            <div className="text-sm text-slate-600">
              <span className="inline-flex items-center gap-1 text-emerald-700 font-medium"><CheckCircle size={16} weight="fill" />Location save hai</span>
              <span className="block text-xs text-slate-500">
                {acc !== null ? `${acc} m, ${LEVEL[accLevel].word}` : 'Link se (GPS nahi)'}{when ? `, ${when}` : ''}
              </span>
            </div>
          ) : <div className="text-sm text-slate-500">Abhi location save nahi hai</div>}
        </div>
      </div>

      {has ? (
        <div className="flex flex-wrap gap-2">
          <a className="btn btn-primary btn-sm" href={urls.google} target="_blank" rel="noopener noreferrer"><NavigationArrow size={18} weight="fill" />Navigate</a>
          {isApple() && <a className="btn btn-sm" href={urls.apple} target="_blank" rel="noopener noreferrer"><NavigationArrow size={18} />Apple Maps</a>}
          <Link className="btn btn-sm" to={`/map?focus=${party.id}`}><MapTrifold size={18} />Map par dekho</Link>
          {IS_ADMIN && <button className="btn btn-sm" onClick={startGps}><Crosshair size={18} />Location badlo</button>}
          {IS_ADMIN && <button className="btn btn-sm" onClick={startLink}><LinkSimple size={18} />Link se badlo</button>}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary btn-sm" onClick={startGps}><Crosshair size={18} />Location lo</button>
          <button className="btn btn-sm" onClick={startLink}><LinkSimple size={18} />Maps link paste karo</button>
        </div>
      )}

      <Modal open={mode !== null} onClose={close} title={mode === 'link' ? 'Maps link se location' : 'Location lo'}>
        {mode === 'gps' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Customer ke <b>darwaze ya entrance par</b> khade ho kar dabao. Khule aasmaan ke neeche GPS zyada sahi hota hai.</p>
            {phase === 'searching' && (
              <div className="rounded-xl bg-slate-50 p-3 text-sm" role="status">
                <div className="font-medium">GPS dhundh raha hai...</div>
                <div className="text-slate-600 num">{progress === null ? 'Pehla signal aane do' : `Abhi sahi: ${Math.round(progress)} m`}</div>
              </div>
            )}
            {phase === 'error' && (
              <div className="rounded-xl bg-red-50 text-red-700 p-3 text-sm flex gap-2" role="alert"><WarningCircle size={20} className="shrink-0" />{error}</div>
            )}
            {phase === 'result' && result && (
              <div className="rounded-xl bg-slate-50 p-3 text-sm space-y-1">
                <div className="num">{fmt6(result.lat)}, {fmt6(result.lng)}</div>
                <div className="text-slate-600 num">Sahi: {result.accuracy} m</div>
                <div className={`font-semibold ${LEVEL[level].cls}`}>{LEVEL[level].text}</div>
              </div>
            )}
            {far && (
              <div className="rounded-xl bg-red-50 text-red-700 p-3 text-sm flex gap-2" role="alert">
                <Warning size={20} className="shrink-0" weight="fill" />
                <span>Ye nayi location purani se <b>{formatDistance(moved)}</b> door hai. Pakka karo ki aap sahi customer ke paas ho.</span>
              </div>
            )}
            <div className="flex flex-col gap-2">
              {phase === 'result' && level === 'poor' && <button className="btn btn-primary" onClick={startGps}>Dobara try karo</button>}
              {phase === 'error' && <button className="btn btn-primary" onClick={startGps}>Dobara try karo</button>}
              {phase === 'result' && (
                <button className={`btn ${level === 'poor' ? '' : 'btn-primary'}`} disabled={busy} onClick={save}>
                  {far && farConfirm ? 'Haan, location badlo' : level === 'poor' ? 'Phir bhi save karo' : 'Save karo'}
                </button>
              )}
              {phase === 'result' && level !== 'poor' && <button className="btn" onClick={startGps}>Dobara try karo</button>}
              <button className="btn btn-ghost" onClick={close}>Cancel</button>
            </div>
          </div>
        )}

        {mode === 'link' && (
          <div className="space-y-3">
            <Field label="Google Maps link ya 'lat, lng'" hint="Customer ne WhatsApp par jo location bheji ho uska poora link yahan paste karo.">
              <textarea className="input !py-2.5" rows={3} value={text} onChange={(e) => { setText(e.target.value); setFarConfirm(false); }} />
            </Field>
            {text.trim() && !parsed && (
              <div className="rounded-xl bg-red-50 text-red-700 p-3 text-sm flex gap-2" role="alert">
                <WarningCircle size={20} className="shrink-0" />Is link mein location nahi mili. Poora Google Maps link chahiye (chhota maps.app.goo.gl link nahi chalta).
              </div>
            )}
            {parsed && (
              <div className="rounded-xl bg-slate-50 p-3 text-sm space-y-1">
                <div className="font-medium text-emerald-700">Location mil gayi</div>
                <div className="num">{fmt6(parsed.lat)}, {fmt6(parsed.lng)}</div>
              </div>
            )}
            {far && (
              <div className="rounded-xl bg-red-50 text-red-700 p-3 text-sm flex gap-2" role="alert">
                <Warning size={20} className="shrink-0" weight="fill" />
                <span>Ye nayi location purani se <b>{formatDistance(moved)}</b> door hai. Pakka karo ki link sahi customer ka hai.</span>
              </div>
            )}
            <div className="flex flex-col gap-2">
              {parsed && <button className="btn btn-primary" disabled={busy} onClick={save}>{far && farConfirm ? 'Haan, location badlo' : 'Save karo'}</button>}
              <button className="btn btn-ghost" onClick={close}>Cancel</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
