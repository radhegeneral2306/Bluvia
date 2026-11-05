import { describe, it, expect } from 'vitest';
import en from '../src/locales/en.js';
import hi from '../src/locales/hi.js';
import { translate, defaultLang } from '../src/lib/i18n.js';
import { hasDevanagari, textToImage } from '../src/lib/hindiText.js';

describe('translate', () => {
  it('returns the text per language', () => {
    expect(translate('en', 'nav.home')).toBe('Home');
    expect(translate('hi', 'nav.home')).toBe('होम');
  });
  it('interpolates {name} params and keeps unknown placeholders', () => {
    const orig = en['common.save'];
    en['common.save'] = 'Hi {name}, {n} left {x}';
    try {
      expect(translate('en', 'common.save', { name: 'Ram', n: 0 })).toBe('Hi Ram, 0 left {x}');
    } finally { en['common.save'] = orig; }
  });
  it('falls back to English, then to the key', () => {
    const saved = hi['nav.bills'];
    delete hi['nav.bills'];
    try { expect(translate('hi', 'nav.bills')).toBe('Bills'); } finally { hi['nav.bills'] = saved; }
    expect(translate('hi', 'no.such.key')).toBe('no.such.key');
    expect(translate('xx', 'nav.home')).toBe('Home');
  });
  it('default language: owner en, staff hi', () => {
    expect(defaultLang({ role: 'admin' })).toBe('en');
    expect(defaultLang({ role: 'staff' })).toBe('hi');
  });
});

describe('locale files', () => {
  it('have exactly the same keys', () => {
    expect(Object.keys(hi).sort()).toEqual(Object.keys(en).sort());
  });
  it('have no empty text and no em/en dash', () => {
    for (const [name, loc] of [['en', en], ['hi', hi]]) {
      for (const [k, v] of Object.entries(loc)) {
        expect(typeof v === 'string' && v.trim().length > 0, `${name}:${k} empty`).toBe(true);
        expect(/[–—]/.test(v), `${name}:${k} has a dash`).toBe(false);
      }
    }
  });
  it('hi values for text keys contain Devanagari (except brand words)', () => {
    expect(hasDevanagari(hi['nav.home'])).toBe(true);
    expect(hasDevanagari(hi['common.save'])).toBe(true);
  });
  it('keys are namespaced', () => {
    for (const k of Object.keys(en)) expect(k).toMatch(/^[a-z]+(\.[A-Za-z]+)+$/);
  });
});

describe('hindiText', () => {
  it('hasDevanagari', () => {
    expect(hasDevanagari('राम स्वीट्स')).toBe(true);
    expect(hasDevanagari('Ram Sweets 123')).toBe(false);
    expect(hasDevanagari('Ram राम')).toBe(true);
    expect(hasDevanagari(null)).toBe(false);
  });
  it('textToImage fails soft without a canvas', async () => {
    expect(await textToImage('राम')).toBeNull();
    expect(await textToImage('')).toBeNull();
  });
});
