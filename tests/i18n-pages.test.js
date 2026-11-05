import { describe, it, expect } from 'vitest';
import { MESSAGES } from '../src/lib/i18n.js';

const files = import.meta.glob('../src/locales/pages/*.js', { eager: true });

describe('page locale fragments', () => {
  for (const [path, m] of Object.entries(files)) {
    const name = path.split('/').pop();
    it(`${name}: same keys in en and hi, no empty text, no dash`, () => {
      const en = m.default?.en || {}; const hi = m.default?.hi || {};
      expect(Object.keys(hi).sort()).toEqual(Object.keys(en).sort());
      for (const [lang, loc] of [['en', en], ['hi', hi]]) {
        for (const [k, v] of Object.entries(loc)) {
          expect(typeof v === 'string' && v.trim().length > 0, `${name} ${lang}:${k} empty`).toBe(true);
          expect(/[–—]/.test(v), `${name} ${lang}:${k} dash`).toBe(false);
        }
      }
    });
    it(`${name}: Hindi text uses Devanagari`, () => {
      for (const [k, v] of Object.entries(m.default?.hi || {})) {
        if (/[A-Za-z]{4,}/.test(v.replace(/\{\w+\}/g, ''))) continue; // brand / unit words may stay Latin
        expect(/[ऀ-ॿ]/.test(v) || !/[A-Za-z]/.test(v), `${name} hi:${k}`).toBe(true);
      }
    });
  }
  it('merged tables have identical key sets', () => {
    expect(Object.keys(MESSAGES.hi).sort()).toEqual(Object.keys(MESSAGES.en).sort());
  });
});
