import { useRef, useState } from 'react';
import { errText } from '../lib/errors.js';
import { Link } from 'react-router-dom';
import { MapPin, Crosshair, LinkSimple, NavigationArrow, MapTrifold, WarningCircle, CheckCircle, Warning } from '@phosphor-icons/react';
import { Modal, Field, useToast } from './ui.jsx';
import { useStore } from '../data/store.jsx';
import { useT } from '../lib/i18n.js';
import { saveLocation } from '../data/api.js';
import { getBestPosition } from '../lib/gps.js';
import { dateKeyOf, fmtDate } from '../lib/dates.js';
import { accuracyLevel, formatDistance, hasLocation, haversineMeters, navUrls, parseMapsLink, FAR_MOVE_M } from '../lib/geo.js';

const LEVEL = {
  good: { text: 'loc.level.good', cls: 'text-emerald-700', word: 'loc.word.good' },
  ok: { text: 'loc.level.ok', cls: 'text-amber-700', word: 'loc.word.ok' },
  poor: { text: 'loc.level.poor', cls: 'text-red-700', word: 'loc.word.poor' },
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
  const { t: tr } = useT();
  const { isAdmin: IS_ADMIN } = useStore(); // staff may set a location only when none is saved yet
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
      .catch((e) => { if (run.current === id) { setError(e?.code ? tr('loc.gps.' + e.code) : tr('loc.err.none')); setPhase('error'); } });
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
      toast(st === 'queued' ? tr('loc.toast.queued') : tr('loc.toast.saved'), st === 'queued' ? 'warn' : 'ok');
      close();
    } catch (e) { toast(errText(e, tr), 'err'); } finally { setBusy(false); }
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
          <div className="font-semibold">{tr('loc.title')}</div>
          {has ? (
            <div className="text-sm text-slate-600">
              <span className="inline-flex items-center gap-1 text-emerald-700 font-medium"><CheckCircle size={16} weight="fill" />{tr('loc.saved')}</span>
              <span className="block text-xs text-slate-500">
                {acc !== null ? tr('loc.accLine', { acc, word: tr(LEVEL[accLevel].word) }) : tr('loc.fromLink')}{when ? `, ${when}` : ''}
              </span>
            </div>
          ) : <div className="text-sm text-slate-500">{tr('loc.notSaved')}</div>}
        </div>
      </div>

      {has ? (
        <div className="flex flex-wrap gap-2">
          <a className="btn btn-primary btn-sm" href={urls.google} target="_blank" rel="noopener noreferrer"><NavigationArrow size={18} weight="fill" />{tr('loc.navigate')}</a>
          {isApple() && <a className="btn btn-sm" href={urls.apple} target="_blank" rel="noopener noreferrer"><NavigationArrow size={18} />{tr('loc.appleMaps')}</a>}
          <Link className="btn btn-sm" to={`/map?focus=${party.id}`}><MapTrifold size={18} />{tr('loc.showMap')}</Link>
          {IS_ADMIN && <button className="btn btn-sm" onClick={startGps}><Crosshair size={18} />{tr('loc.change')}</button>}
          {IS_ADMIN && <button className="btn btn-sm" onClick={startLink}><LinkSimple size={18} />{tr('loc.changeLink')}</button>}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary btn-sm" onClick={startGps}><Crosshair size={18} />{tr('loc.get')}</button>
          <button className="btn btn-sm" onClick={startLink}><LinkSimple size={18} />{tr('loc.pasteLink')}</button>
        </div>
      )}

      <Modal open={mode !== null} onClose={close} title={mode === 'link' ? tr('loc.modal.link') : tr('loc.modal.gps')}>
        {mode === 'gps' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">{tr('loc.gpsHelp')}</p>
            {phase === 'searching' && (
              <div className="rounded-xl bg-slate-50 p-3 text-sm" role="status">
                <div className="font-medium">{tr('loc.searching')}</div>
                <div className="text-slate-600 num">{progress === null ? tr('loc.firstSignal') : tr('loc.accNow', { m: Math.round(progress) })}</div>
              </div>
            )}
            {phase === 'error' && (
              <div className="rounded-xl bg-red-50 text-red-700 p-3 text-sm flex gap-2" role="alert"><WarningCircle size={20} className="shrink-0" />{error}</div>
            )}
            {phase === 'result' && result && (
              <div className="rounded-xl bg-slate-50 p-3 text-sm space-y-1">
                <div className="num">{fmt6(result.lat)}, {fmt6(result.lng)}</div>
                <div className="text-slate-600 num">{tr('loc.accuracy', { m: result.accuracy })}</div>
                <div className={`font-semibold ${LEVEL[level].cls}`}>{tr(LEVEL[level].text)}</div>
              </div>
            )}
            {far && (
              <div className="rounded-xl bg-red-50 text-red-700 p-3 text-sm flex gap-2" role="alert">
                <Warning size={20} className="shrink-0" weight="fill" />
                <span>{tr('loc.far', { dist: formatDistance(moved) })}</span>
              </div>
            )}
            <div className="flex flex-col gap-2">
              {phase === 'result' && level === 'poor' && <button className="btn btn-primary" onClick={startGps}>{tr('loc.tryAgain')}</button>}
              {phase === 'error' && <button className="btn btn-primary" onClick={startGps}>{tr('loc.tryAgain')}</button>}
              {phase === 'result' && (
                <button className={`btn ${level === 'poor' ? '' : 'btn-primary'}`} disabled={busy} onClick={save}>
                  {far && farConfirm ? tr('loc.yesChange') : level === 'poor' ? tr('loc.saveAnyway') : tr('loc.save')}
                </button>
              )}
              {phase === 'result' && level !== 'poor' && <button className="btn" onClick={startGps}>{tr('loc.tryAgain')}</button>}
              <button className="btn btn-ghost" onClick={close}>{tr('common.cancel')}</button>
            </div>
          </div>
        )}

        {mode === 'link' && (
          <div className="space-y-3">
            <Field label={tr('loc.linkLabel')} hint={tr('loc.linkHint')}>
              <textarea className="input !py-2.5" rows={3} value={text} onChange={(e) => { setText(e.target.value); setFarConfirm(false); }} />
            </Field>
            {text.trim() && !parsed && (
              <div className="rounded-xl bg-red-50 text-red-700 p-3 text-sm flex gap-2" role="alert">
                <WarningCircle size={20} className="shrink-0" />{tr('loc.linkBad')}
              </div>
            )}
            {parsed && (
              <div className="rounded-xl bg-slate-50 p-3 text-sm space-y-1">
                <div className="font-medium text-emerald-700">{tr('loc.found')}</div>
                <div className="num">{fmt6(parsed.lat)}, {fmt6(parsed.lng)}</div>
              </div>
            )}
            {far && (
              <div className="rounded-xl bg-red-50 text-red-700 p-3 text-sm flex gap-2" role="alert">
                <Warning size={20} className="shrink-0" weight="fill" />
                <span>{tr('loc.farLink', { dist: formatDistance(moved) })}</span>
              </div>
            )}
            <div className="flex flex-col gap-2">
              {parsed && <button className="btn btn-primary" disabled={busy} onClick={save}>{far && farConfirm ? tr('loc.yesChange') : tr('loc.save')}</button>}
              <button className="btn btn-ghost" onClick={close}>{tr('common.cancel')}</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
