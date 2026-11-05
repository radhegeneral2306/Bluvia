import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { hasLocation } from '../lib/geo.js';

const RED = '#c52020';
const GREEN = '#047857';
const GREY = '#687b84';
const BRAND = '#027680';
const BLUE = '#2563eb';

const pinColor = (p) => ((p.outstanding || 0) > 0 ? RED : (p.outstanding || 0) < 0 ? GREEN : GREY);

// Leaflet's own zoom buttons are 30px: make them thumb sized, and keep every Leaflet pane below the app's sheets and nav.
const CSS = `
.party-map .leaflet-bar a { width: 44px; height: 44px; line-height: 44px; font-size: 20px; }
.party-map .leaflet-control-attribution { font-size: 11px; }
.party-map .leaflet-container { font: inherit; background: rgb(var(--s-100)); }
`;

/**
 * Leaflet map with one circle pin per party (no image markers, so nothing breaks under the bundler).
 * Props: parties (already filtered), selectedId, onSelect(id), here ({lat,lng}|null), fitKey (refit when it changes), focusId (zoom to this party), t (translate function, for the map aria-label).
 * Tiles: OpenStreetMap (attribution is mandatory).
 */
export default function PartyMap({ parties, selectedId, onSelect, here, fitKey, focusId, t }) {
  const label = t || ((k) => k);
  const boxRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const lastFit = useRef(null);
  const lastFocus = useRef(null);

  // create and destroy the map
  useEffect(() => {
    const map = L.map(boxRef.current, { zoomControl: true, attributionControl: true }).setView([21.2514, 81.6296], 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => map.invalidateSize()) : null;
    if (ro) ro.observe(boxRef.current);
    return () => {
      if (ro) ro.disconnect();
      map.remove();
      mapRef.current = null; layerRef.current = null; lastFit.current = null; lastFocus.current = null;
    };
  }, []);

  // draw pins, the selected ring and the blue "you are here" dot
  useEffect(() => {
    const map = mapRef.current; const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const pts = [];
    parties.filter(hasLocation).forEach((p) => {
      const ll = [p.lat, p.lng];
      pts.push(ll);
      const sel = p.id === selectedId;
      if (sel) L.circleMarker(ll, { radius: 19, color: BRAND, weight: 3, fill: false, interactive: false }).addTo(layer);
      L.circleMarker(ll, { radius: sel ? 13 : 11, color: '#ffffff', weight: 2, fillColor: pinColor(p), fillOpacity: 1 })
        .on('click', () => selectRef.current && selectRef.current(p.id))
        .bindTooltip(p.name, { direction: 'top', offset: [0, -8] })
        .addTo(layer);
    });
    if (here && Number.isFinite(here.lat) && Number.isFinite(here.lng)) {
      L.circle([here.lat, here.lng], { radius: 25, color: BLUE, weight: 1, fillColor: BLUE, fillOpacity: 0.15, interactive: false }).addTo(layer);
      L.circleMarker([here.lat, here.lng], { radius: 8, color: '#ffffff', weight: 3, fillColor: BLUE, fillOpacity: 1, interactive: false }).addTo(layer);
    }
    // refit only when the filter set changed (fitKey), never when the user just taps a pin
    const focus = focusId ? parties.find((p) => p.id === focusId && hasLocation(p)) : null;
    if (focus && lastFocus.current !== focusId) {
      lastFocus.current = focusId; lastFit.current = fitKey;
      map.setView([focus.lat, focus.lng], 17);
    } else if (lastFit.current !== fitKey && pts.length) {
      lastFit.current = fitKey;
      if (pts.length === 1) map.setView(pts[0], 16);
      else map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 17 });
    }
  }, [parties, selectedId, here, fitKey, focusId]);

  return (
    <div className="party-map" style={{ isolation: 'isolate', position: 'relative', zIndex: 0 }}>
      <style>{CSS}</style>
      <div ref={boxRef} role="application" aria-label={label('map.mapAria')} className="w-full rounded-2xl overflow-hidden border border-slate-200"
        style={{ height: 'max(320px, calc(100dvh - 330px))' }} />
    </div>
  );
}
