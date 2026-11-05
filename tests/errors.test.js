import { describe, it, expect } from 'vitest';
import { errKey, errText } from '../src/lib/errors.js';

const t = (k) => `T:${k}`;
const E = (code, message) => Object.assign(new Error(message || ''), { code });

describe('errors', () => {
  it('maps api codes', () => {
    expect(errKey(E('OFFLINE_BILL'))).toBe('err.offlineBill');
    expect(errKey(E('BILL_CONNECTION'))).toBe('err.billConn');
    expect(errKey(E('ENTRY_GONE'))).toBe('err.entryGone');
    expect(errKey(E('ENTRY_DELETED'))).toBe('err.entryDeleted');
    expect(errKey(E('ENTRY_ACTIVE'))).toBe('err.entryActive');
    expect(errKey(E('NOT_RECEIPT'))).toBe('err.notReceipt');
  });
  it('maps firebase codes', () => {
    expect(errKey(E('permission-denied'))).toBe('err.denied');
    expect(errKey(E('firestore/permission-denied'))).toBe('err.denied');
    for (const c of ['unavailable', 'deadline-exceeded', 'failed-precondition']) expect(errKey(E(c))).toBe('err.network');
    expect(errKey(E('resource-exhausted'))).toBe('err.busy');
  });
  it('never leaks technical text', () => {
    const raw = 'PERMISSION_DENIED: evaluation error at L160:12';
    expect(errText(new Error(raw), t)).toBe('T:err.denied');
    expect(errText(E('weird', 'FirebaseError: boom'), t)).toBe('T:err.unknown');
    expect(errText(E('weird', 'Missing or insufficient permissions.'), t)).toBe('T:err.denied');
  });
  it('falls back to a plain message, else unknown', () => {
    expect(errText(E('x', 'Phone number is required'), t)).toBe('Phone number is required');
    expect(errText(null, t)).toBe('T:err.unknown');
    expect(errText({}, t)).toBe('T:err.unknown');
  });
});
