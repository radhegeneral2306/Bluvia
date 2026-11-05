import { describe, it, expect } from 'vitest';
import { canModifyTxn, editMinutesLeft, byLine, STAFF_EDIT_WINDOW_MS, canRestore, canManageParties, canManageSettings } from '../src/lib/roles.js';

const admin = { role: 'admin', active: true };
const staff = { role: 'staff', active: true };
const blocked = { role: 'staff', active: false };
const NOW = 1_800_000_000_000;
const at = (msAgo) => ({ toMillis: () => NOW - msAgo });
const mine = (type, msAgo) => ({ type, createdBy: { uid: 's1', name: 'Ravi' }, createdAt: at(msAgo) });

describe('canModifyTxn', () => {
  it('admin can always modify, including receipts, old and other people entries', () => {
    expect(canModifyTxn(admin, 'a', { type: 'receipt', createdBy: { uid: 'x' }, createdAt: at(10 * 3600e3) }, NOW)).toBe(true);
    expect(canModifyTxn(admin, 'a', { type: 'adjustment' }, NOW)).toBe(true);
  });
  it('no profile or no entry means no', () => {
    expect(canModifyTxn(null, 's1', mine('bill', 0), NOW)).toBe(false);
    expect(canModifyTxn(staff, 's1', null, NOW)).toBe(false);
  });
  it('staff can modify own bill-type entries within the first hour', () => {
    for (const t of ['bill', 'jarReturn', 'jarGiven', 'depositTaken']) {
      expect(canModifyTxn(staff, 's1', mine(t, 59 * 60e3), NOW)).toBe(true);
    }
  });
  it('staff cannot modify own receipt, refund, adjust, adjustment', () => {
    for (const t of ['receipt', 'depositRefund', 'depositAdjust', 'adjustment']) {
      expect(canModifyTxn(staff, 's1', mine(t, 1000), NOW)).toBe(false);
    }
  });
  it("staff cannot modify another staff's entry or one without createdBy", () => {
    expect(canModifyTxn(staff, 's2', mine('bill', 1000), NOW)).toBe(false);
    expect(canModifyTxn(staff, 's1', { type: 'bill', createdAt: at(1000) }, NOW)).toBe(false);
  });
  it('just-created entry without createdAt is still editable', () => {
    expect(canModifyTxn(staff, 's1', { type: 'bill', createdBy: { uid: 's1' } }, NOW)).toBe(true);
  });
  it('after one hour it is locked, exactly one hour is locked', () => {
    expect(canModifyTxn(staff, 's1', mine('bill', STAFF_EDIT_WINDOW_MS - 1), NOW)).toBe(true);
    expect(canModifyTxn(staff, 's1', mine('bill', STAFF_EDIT_WINDOW_MS), NOW)).toBe(false);
    expect(canModifyTxn(staff, 's1', mine('bill', 2 * 3600e3), NOW)).toBe(false);
  });
  it('inactive staff and unknown roles cannot modify', () => {
    expect(canModifyTxn(blocked, 's1', mine('bill', 1000), NOW)).toBe(false);
    expect(canModifyTxn({ role: 'other' }, 's1', mine('bill', 1000), NOW)).toBe(false);
  });
  it('accepts createdAt as seconds object or number', () => {
    expect(canModifyTxn(staff, 's1', { type: 'bill', createdBy: { uid: 's1' }, createdAt: { seconds: (NOW - 1000) / 1000 } }, NOW)).toBe(true);
    expect(canModifyTxn(staff, 's1', { type: 'bill', createdBy: { uid: 's1' }, createdAt: NOW - 2 * 3600e3 }, NOW)).toBe(false);
  });
});

describe('editMinutesLeft', () => {
  it('admin has no limit', () => expect(editMinutesLeft(admin, mine('bill', 0), NOW)).toBeNull());
  it('counts down for staff and rounds up', () => {
    expect(editMinutesLeft(staff, mine('bill', 0), NOW)).toBe(60);
    expect(editMinutesLeft(staff, mine('bill', 30 * 60e3), NOW)).toBe(30);
    expect(editMinutesLeft(staff, mine('bill', 59.5 * 60e3), NOW)).toBe(1);
  });
  it('is 0 when over and never negative', () => {
    expect(editMinutesLeft(staff, mine('bill', STAFF_EDIT_WINDOW_MS), NOW)).toBe(0);
    expect(editMinutesLeft(staff, mine('bill', 5 * 3600e3), NOW)).toBe(0);
  });
  it('is 60 for an entry without createdAt', () => expect(editMinutesLeft(staff, { type: 'bill' }, NOW)).toBe(60));
});

describe('byLine and admin-only helpers', () => {
  it('shows the creator name or empty', () => {
    expect(byLine({ createdBy: { uid: 's1', name: 'Ravi' } })).toBe('Ravi');
    expect(byLine({ createdBy: { uid: 's1' } })).toBe('');
    expect(byLine({})).toBe('');
    expect(byLine(null)).toBe('');
  });
  it('restore, parties and settings are admin only', () => {
    for (const f of [canRestore, canManageParties, canManageSettings]) {
      expect(f(admin)).toBe(true);
      expect(f(staff)).toBe(false);
      expect(f(null)).toBe(false);
    }
  });
});
