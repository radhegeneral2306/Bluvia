// Render text containing Devanagari to an image using the BROWSER's text shaping, because jsPDF cannot
// shape complex scripts. See docs/HINDI_NOTES.md. Fails soft: returns null when no canvas is available.

const DEVANAGARI = /[ऀ-ॿ꣠-ꣿ]/;
export const hasDevanagari = (str) => DEVANAGARI.test(String(str ?? ''));

export const HINDI_FONT_STACK = '"Noto Sans Devanagari","Mangal","Nirmala UI","Lohit Devanagari",sans-serif';

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') { try { return new OffscreenCanvas(w, h); } catch { /* fall through */ } }
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }
  return null;
}

async function toDataUrl(cv) {
  if (typeof cv.toDataURL === 'function') return cv.toDataURL('image/png');
  const blob = await cv.convertToBlob({ type: 'image/png' });
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
}

/**
 * @returns {Promise<{dataUrl:string,widthPx:number,heightPx:number,lines:number}|null>}
 * Wraps at maxWidthPx (when given). Pixel sizes are at the requested fontSizePx; the caller scales to pt.
 * Pass a large fontSizePx (e.g. 4x the pt size) for a sharp PDF and divide when placing.
 */
export async function textToImage(str, { fontSizePx = 32, color = '#000000', maxWidthPx = 0, bold = false } = {}) {
  try {
    const text = String(str ?? '');
    if (!text) return null;
    if (typeof document !== 'undefined' && document.fonts?.load) {
      try { await document.fonts.load(`${fontSizePx}px ${HINDI_FONT_STACK}`, text); } catch { /* ignore */ }
    }
    const font = `${bold ? 'bold ' : ''}${fontSizePx}px ${HINDI_FONT_STACK}`;
    const probe = makeCanvas(8, 8);
    const pctx = probe?.getContext?.('2d');
    if (!pctx) return null;
    pctx.font = font;
    const measure = (s) => pctx.measureText(s).width;
    // word wrap
    const lines = [];
    for (const para of text.split(/\r?\n/)) {
      if (!maxWidthPx) { lines.push(para); continue; }
      let line = '';
      for (const w of para.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${w}` : w;
        if (!line || measure(next) <= maxWidthPx) line = next; else { lines.push(line); line = w; }
      }
      lines.push(line);
    }
    const lineH = Math.ceil(fontSizePx * 1.5); // Devanagari matras need room above and below
    const pad = Math.ceil(fontSizePx * 0.1);
    const widthPx = Math.max(1, Math.ceil(Math.max(...lines.map(measure))) + pad * 2);
    const heightPx = lineH * lines.length;
    const cv = makeCanvas(widthPx, heightPx);
    const ctx = cv?.getContext?.('2d');
    if (!ctx) return null;
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textBaseline = 'alphabetic';
    lines.forEach((ln, i) => ctx.fillText(ln, pad, i * lineH + Math.round(fontSizePx * 1.1)));
    return { dataUrl: await toDataUrl(cv), widthPx, heightPx, lines: lines.length };
  } catch {
    return null;
  }
}
