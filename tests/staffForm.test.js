import { describe, it, expect } from 'vitest';
import { validateStaff, normalizeUid, normalizeName, shortUid, staffRows } from '../src/lib/staffForm.js';

const UID = 'AbCdEfGhIjKlMnOpQrStUvWxYz12';

describe('staffForm', () => {
  it('trims the uid', () => {
    expect(normalizeUid(`  ${UID}\n`)).toBe(UID);
    expect(normalizeUid(null)).toBe('');
    expect(normalizeName('  Ramesh   Kumar ')).toBe('Ramesh Kumar');
  });
  it('accepts a good uid and name', () => {
    const r = validateStaff({ uid: ` ${UID} `, name: ' Ramesh ' });
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ uid: UID, name: 'Ramesh' });
  });
  it('rejects empty, short, long and symbol uids', () => {
    expect(validateStaff({ uid: '', name: 'A' }).errors.uid).toBeTruthy();
    expect(validateStaff({ uid: 'abc', name: 'A' }).errors.uid).toBeTruthy();
    expect(validateStaff({ uid: 'a'.repeat(41), name: 'A' }).errors.uid).toBeTruthy();
    expect(validateStaff({ uid: `${UID}-x`, name: 'A' }).errors.uid).toBeTruthy();
    expect(validateStaff({ uid: 'a'.repeat(20), name: 'A' }).ok).toBe(true);
    expect(validateStaff({ uid: 'a'.repeat(40), name: 'A' }).ok).toBe(true);
    expect(validateStaff({ uid: 'a'.repeat(19), name: 'A' }).ok).toBe(false);
  });
  it('rejects blank and too long names', () => {
    expect(validateStaff({ uid: UID, name: '   ' }).errors.name).toBeTruthy();
    expect(validateStaff({ uid: UID, name: 'x'.repeat(61) }).errors.name).toBeTruthy();
    expect(validateStaff({ uid: UID, name: 'x'.repeat(60) }).ok).toBe(true);
    expect(validateStaff().ok).toBe(false);
  });
  it('shortens a uid for display', () => {
    expect(shortUid(UID)).toBe('AbCdEf...Yz12');
    expect(shortUid('abc')).toBe('abc');
  });
  it('sorts active first, then by name', () => {
    const rows = staffRows([
      { id: '3', name: 'Zara', active: true },
      { id: '1', name: 'bhola', active: false },
      { id: '2', name: 'Amit', active: true },
      { id: '4', name: 'Aaa', active: false },
      null,
      { name: 'no id' },
    ]);
    expect(rows.map((r) => r.id)).toEqual(['2', '3', '4', '1']);
    expect(staffRows(undefined)).toEqual([]);
  });
});
