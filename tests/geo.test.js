import { describe, it, expect, vi } from 'vitest';
import { validLatLng, hasLocation, haversineMeters, formatDistance, accuracyLevel, navUrls, parseMapsLink, nearestParties, locationProgress } from '../src/lib/geo.js';
import { getBestPosition } from '../src/lib/gps.js';

describe('geo helpers', () => {
  it('validates coordinates (range, numbers, and the 0,0 placeholder is rejected)', () => {
    expect(validLatLng(21.2514, 81.6296)).toBe(true);
    expect(validLatLng(91, 10)).toBe(false); expect(validLatLng(10, 181)).toBe(false);
    expect(validLatLng('21', '81')).toBe(false); expect(validLatLng(NaN, 1)).toBe(false); expect(validLatLng(0, 0)).toBe(false);
    expect(hasLocation({ lat: 21.25, lng: 81.63 })).toBe(true); expect(hasLocation({})).toBe(false); expect(hasLocation(null)).toBe(false);
  });
  it('haversine: known distances', () => {
    expect(haversineMeters({ lat: 21.25, lng: 81.63 }, { lat: 21.25, lng: 81.63 })).toBe(0);
    const d = haversineMeters({ lat: 21.2514, lng: 81.6296 }, { lat: 21.2514, lng: 81.6396 });   // 0.01 deg of longitude at ~21N
    expect(d).toBeGreaterThan(1030); expect(d).toBeLessThan(1080);
    const delhiMumbai = haversineMeters({ lat: 28.6139, lng: 77.209 }, { lat: 19.076, lng: 72.8777 });
    expect(delhiMumbai / 1000).toBeGreaterThan(1130); expect(delhiMumbai / 1000).toBeLessThan(1160);
  });
  it('formats distance', () => {
    expect(formatDistance(85.4)).toBe('85 m'); expect(formatDistance(999)).toBe('999 m'); expect(formatDistance(1234)).toBe('1.2 km');
    expect(formatDistance(15200)).toBe('15 km'); expect(formatDistance(undefined)).toBe('');
  });
  it('accuracy levels: 50 good, 200 ok, beyond poor', () => {
    expect(accuracyLevel(12)).toBe('good'); expect(accuracyLevel(50)).toBe('good'); expect(accuracyLevel(51)).toBe('ok');
    expect(accuracyLevel(200)).toBe('ok'); expect(accuracyLevel(201)).toBe('poor'); expect(accuracyLevel(null)).toBe('poor'); expect(accuracyLevel(-1)).toBe('poor');
  });
  it('navigation links carry the coordinates and need no key', () => {
    const u = navUrls(21.25143, 81.62961);
    expect(u.google).toContain('destination=21.251430,81.629610'); expect(u.apple).toContain('daddr=21.251430,81.629610'); expect(u.google).not.toMatch(/key=/);
  });
});

describe('parseMapsLink', () => {
  const ok = (s, lat, lng) => { const r = parseMapsLink(s); expect(r).not.toBeNull(); expect(r.lat).toBeCloseTo(lat, 5); expect(r.lng).toBeCloseTo(lng, 5); };
  it('google maps @lat,lng link', () => ok('https://www.google.com/maps/place/Raipur/@21.2514,81.6296,17z/data=!3m1', 21.2514, 81.6296));
  it('google maps place pin !3d !4d (preferred over the map centre)', () => ok('https://www.google.com/maps/place/X/@21.25,81.60,15z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d21.2601!4d81.6321', 21.2601, 81.6321));
  it('q= and ll= and query= and destination= forms', () => {
    ok('https://maps.google.com/?q=21.2514,81.6296', 21.2514, 81.6296);
    ok('https://maps.apple.com/?ll=21.2514,81.6296&z=18', 21.2514, 81.6296);
    ok('https://www.google.com/maps/search/?api=1&query=21.2514%2C81.6296', 21.2514, 81.6296);
    ok('https://www.google.com/maps/dir/?api=1&destination=21.2514,81.6296', 21.2514, 81.6296);
  });
  it('plain text and WhatsApp style messages', () => {
    ok('21.2514, 81.6296', 21.2514, 81.6296); ok('  21.2514 81.6296 ', 21.2514, 81.6296);
    ok('Meri location https://maps.google.com/?q=21.2514,81.6296 yeh hai', 21.2514, 81.6296);
    ok('https://www.google.com/maps?q=-33.8688,151.2093', -33.8688, 151.2093);
  });
  it('short links, garbage, empty and impossible numbers give null', () => {
    expect(parseMapsLink('https://maps.app.goo.gl/abc123XYZ')).toBeNull(); expect(parseMapsLink('https://goo.gl/maps/abc')).toBeNull();
    expect(parseMapsLink('hello')).toBeNull(); expect(parseMapsLink('')).toBeNull(); expect(parseMapsLink(undefined)).toBeNull();
    expect(parseMapsLink('https://maps.google.com/?q=95.1,81.6')).toBeNull(); expect(parseMapsLink('0,0')).toBeNull();
  });
});

describe('nearest and progress', () => {
  const ps = [
    { id: 'a', name: 'A', lat: 21.2514, lng: 81.6296 }, { id: 'b', name: 'B', lat: 21.2614, lng: 81.6296 },
    { id: 'c', name: 'C' }, { id: 'd', name: 'D', lat: 21.2520, lng: 81.6296 }, { id: 'e', name: 'E', active: false },
  ];
  it('sorts parties with a location by distance, ignores those without, honours the limit', () => {
    const r = nearestParties(ps, { lat: 21.2515, lng: 81.6296 }, 2);
    expect(r.map((x) => x.party.id)).toEqual(['a', 'd']); expect(r[0].meters).toBeLessThan(r[1].meters);
    expect(nearestParties(ps, null)).toEqual([]); expect(nearestParties(ps, { lat: 999, lng: 0 })).toEqual([]);
  });
  it('progress counts only active parties', () => {
    const p = locationProgress(ps);
    expect(p.total).toBe(4); expect(p.done).toBe(3); expect(p.missing.map((x) => x.id)).toEqual(['c']);
  });
});

describe('getBestPosition (GPS)', () => {
  const fakeGeo = (events) => {
    let ok, bad; const cleared = [];
    return {
      cleared,
      watchPosition(s, e) { ok = s; bad = e; setTimeout(() => events.forEach(([t, ev]) => setTimeout(() => (ev.error ? bad(ev.error) : ok({ coords: ev })), t)), 0); return 7; },
      clearWatch(id) { cleared.push(id); },
    };
  };
  it('keeps the most accurate fix and stops early when good enough', async () => {
    const geo = fakeGeo([[5, { latitude: 21.1, longitude: 81.1, accuracy: 120 }], [10, { latitude: 21.2, longitude: 81.2, accuracy: 18.2 }], [15, { latitude: 21.3, longitude: 81.3, accuracy: 5 }]]);
    const seen = [];
    const r = await getBestPosition({ geo, maxMs: 500, goodEnough: 25, onProgress: (p) => seen.push(Math.round(p.accuracy)) });
    expect(r).toEqual({ lat: 21.2, lng: 81.2, accuracy: 19 }); expect(geo.cleared).toEqual([7]); expect(seen[0]).toBe(120);
  });
  it('returns the best fix so far when time runs out', async () => {
    const geo = fakeGeo([[5, { latitude: 21.1, longitude: 81.1, accuracy: 150 }], [8, { latitude: 21.15, longitude: 81.15, accuracy: 90 }]]);
    expect(await getBestPosition({ geo, maxMs: 60, goodEnough: 10 })).toEqual({ lat: 21.15, lng: 81.15, accuracy: 90 });
  });
  it('permission denied rejects at once with a Hinglish message; no fix at all gives timeout', async () => {
    await expect(getBestPosition({ geo: fakeGeo([[5, { error: { code: 1 } }]]), maxMs: 500 })).rejects.toMatchObject({ code: 'denied', message: expect.stringContaining('permission') });
    await expect(getBestPosition({ geo: fakeGeo([]), maxMs: 30 })).rejects.toMatchObject({ code: 'timeout' });
    await expect(getBestPosition({ geo: null })).rejects.toMatchObject({ code: 'unsupported' });
  });
});
