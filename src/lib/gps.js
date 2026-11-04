// Reads the phone's GPS. Keeps listening for a few seconds and returns the BEST (most accurate) fix, because the first fix is often rough.

const MSG = {
  unsupported: 'Is phone ya browser mein location nahi mil sakti.',
  denied: 'Location ki permission band hai. Phone Settings mein is app/browser ke liye Location allow karo, phir dobara try karo.',
  unavailable: 'Location abhi nahi mil rahi. Khule aasmaan ke neeche jaa kar dobara try karo.',
  timeout: 'Location milne mein bahut der lagi. Dobara try karo.',
};

export const gpsError = (code) => ({ code, message: MSG[code] || MSG.unavailable });

/**
 * getBestPosition({ maxMs, goodEnough, onProgress, geo })
 *  - maxMs: stop after this long and return the best fix so far (error 'timeout' only if there was no fix at all)
 *  - goodEnough: stop early when accuracy (metres) is at least this good
 *  - onProgress({ accuracy, lat, lng, elapsedMs })
 *  - geo: navigator.geolocation (injectable for tests)
 * Resolves { lat, lng, accuracy } (accuracy rounded up to whole metres).
 */
export function getBestPosition({ maxMs = 12000, goodEnough = 25, onProgress, geo = typeof navigator !== 'undefined' ? navigator.geolocation : undefined } = {}) {
  return new Promise((resolve, reject) => {
    if (!geo) { reject(gpsError('unsupported')); return; }
    let best = null; let done = false; let watchId = null; let timer = null; let lastErr = null;
    const started = Date.now();
    const finish = (fn) => { if (done) return; done = true; if (watchId !== null) geo.clearWatch(watchId); clearTimeout(timer); fn(); };
    const settle = () => finish(() => (best ? resolve({ lat: best.lat, lng: best.lng, accuracy: Math.ceil(best.accuracy) }) : reject(lastErr || gpsError('timeout'))));
    timer = setTimeout(settle, maxMs);
    watchId = geo.watchPosition(
      (pos) => {
        const c = pos.coords;
        const fix = { lat: c.latitude, lng: c.longitude, accuracy: Number.isFinite(c.accuracy) ? c.accuracy : 9999 };
        if (!best || fix.accuracy < best.accuracy) best = fix;
        if (onProgress) { try { onProgress({ ...best, elapsedMs: Date.now() - started }); } catch { /* ignore */ } }
        if (best.accuracy <= goodEnough) settle();
      },
      (err) => {
        lastErr = gpsError(err && err.code === 1 ? 'denied' : err && err.code === 3 ? 'timeout' : 'unavailable');
        if (err && err.code === 1) finish(() => reject(lastErr));   // denied: no point waiting
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: maxMs },
    );
  });
}
