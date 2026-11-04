// Location helpers (pure functions, unit tested). Party fields: lat, lng (numbers), locAccuracy (metres), locUpdatedAt, locSource ('gps' | 'link').

export const GOOD_ACCURACY_M = 50;     // green
export const OK_ACCURACY_M = 200;      // accepted (amber); worse than this is 'poor' (needs a retry, can still be saved on purpose)
export const FAR_MOVE_M = 200;         // warn when a new location is further than this from the saved one

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

export function validLatLng(lat, lng) {
  return isNum(lat) && isNum(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0);
}
export const hasLocation = (p) => !!p && validLatLng(p.lat, p.lng);

/** Great-circle distance in metres between {lat,lng} points. */
export function haversineMeters(a, b) {
  const R = 6371008.8;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** 85 m -> '85 m', 1234 m -> '1.2 km', 15200 -> '15 km' */
export function formatDistance(m) {
  if (!isNum(m)) return '';
  if (m < 1000) return `${Math.round(m)} m`;
  const km = m / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

/** 'good' <= 50 m, 'ok' <= 200 m, otherwise 'poor' (also for missing values). */
export function accuracyLevel(m) {
  if (!isNum(m) || m < 0) return 'poor';
  if (m <= GOOD_ACCURACY_M) return 'good';
  if (m <= OK_ACCURACY_M) return 'ok';
  return 'poor';
}

/** Links that open the phone's maps app with directions to the point. No key, no cost. */
export function navUrls(lat, lng) {
  const ll = `${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`;
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=driving`,
    apple: `https://maps.apple.com/?daddr=${ll}&dirflg=d`,
    view: `https://www.google.com/maps/search/?api=1&query=${ll}`,
  };
}

/** Pulls coordinates out of text the customer sent: a full Google Maps link, an Apple Maps link, or plain "lat, lng".
 *  Short links (maps.app.goo.gl, goo.gl/maps) hold no coordinates and return null. */
export function parseMapsLink(text) {
  const s = String(text ?? '').trim();
  if (!s) return null;
  if (/(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)/i.test(s) && !/[@=]-?\d+\.\d+,-?\d+\.\d+|!3d-?\d/.test(s)) return null;
  let decoded = s;
  try { decoded = decodeURIComponent(s); } catch { /* keep raw */ }
  const num = '(-?\\d{1,3}(?:\\.\\d+)?)';
  const patterns = [
    new RegExp(`!3d${num}!4d${num}`),                               // place pin inside data=...
    new RegExp(`@${num},\\s*${num}`),                                // .../@lat,lng,zoom
    new RegExp(`[?&](?:q|ll|query|destination|daddr|sll|center)=${num}\\s*,\\s*${num}`, 'i'),
    new RegExp(`^\\s*${num}\\s*[,;\\s]\\s*${num}\\s*$`),             // plain "lat, lng"
  ];
  for (const re of patterns) {
    const m = decoded.match(re);
    if (m) {
      const lat = Number(m[1]), lng = Number(m[2]);
      if (validLatLng(lat, lng)) return { lat, lng };
    }
  }
  return null;
}

/** Parties that have a location, nearest first. here = {lat,lng}. Returns [{ party, meters }]. */
export function nearestParties(parties, here, limit = 50) {
  if (!validLatLng(here?.lat, here?.lng)) return [];
  return parties
    .filter(hasLocation)
    .map((party) => ({ party, meters: haversineMeters(here, party) }))
    .sort((a, b) => a.meters - b.meters)
    .slice(0, limit);
}

/** Progress for the one-time job: how many parties already have a location. */
export function locationProgress(parties) {
  const active = parties.filter((p) => p.active !== false);
  const done = active.filter(hasLocation).length;
  return { done, total: active.length, missing: active.filter((p) => !hasLocation(p)) };
}
