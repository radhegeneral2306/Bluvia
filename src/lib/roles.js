// Roles and who may change what. The Firestore rules enforce the same thing on the server;
// this file only decides what the screens show. Pure functions, covered by tests/roles.test.js.

export const STAFF_EDIT_WINDOW_MS = 60 * 60 * 1000; // staff can edit / delete their own bill for 1 hour
export const STAFF_TYPES = ['bill', 'receipt', 'jarReturn', 'jarGiven', 'depositTaken']; // entry types staff may create
export const STAFF_EDITABLE_TYPES = ['bill', 'jarReturn', 'jarGiven', 'depositTaken'];   // staff may edit/delete these (own, within 1 hour). Never receipts.

/** profile = users/{uid} document (or null). role is 'admin' or 'staff'. */
export const isAdmin = (profile) => profile?.role === 'admin';
export const isStaffRole = (profile) => profile?.role === 'staff';

const millis = (ts) => {
  if (!ts) return null;
  if (typeof ts === 'number') return ts;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  return null;
};

/** Can this user edit or soft-delete this entry? Admin: always. Staff: only their own bill-type entries in the first hour. */
export function canModifyTxn(profile, uid, t, nowMs = Date.now()) {
  if (!profile || !t) return false;
  if (isAdmin(profile)) return true;
  if (!isStaffRole(profile) || profile.active === false) return false;
  if (!STAFF_EDITABLE_TYPES.includes(t.type)) return false;
  if (!t.createdBy || t.createdBy.uid !== uid) return false;
  const created = millis(t.createdAt);
  if (created === null) return true; // just saved on this phone, server time not back yet
  return nowMs - created < STAFF_EDIT_WINDOW_MS;
}

/** Minutes of edit time left for a staff member on this entry (0 when over). Admin: null (no limit). */
export function editMinutesLeft(profile, t, nowMs = Date.now()) {
  if (isAdmin(profile)) return null;
  const created = millis(t?.createdAt);
  if (created === null) return Math.floor(STAFF_EDIT_WINDOW_MS / 60000);
  return Math.max(0, Math.ceil((created + STAFF_EDIT_WINDOW_MS - nowMs) / 60000));
}

export const canRestore = (profile) => isAdmin(profile);
export const canManageParties = (profile) => isAdmin(profile);
export const canManageSettings = (profile) => isAdmin(profile);

/** Short text of who made an entry, for lists. */
export const byLine = (t) => (t?.createdBy?.name ? t.createdBy.name : '');

/** The few fields kept in the audit log for an entry. */
export const AUDIT_FIELDS = ['type', 'billNo', 'partyId', 'partyName', 'dateKey', 'total', 'amount', 'qty', 'mode', 'reference', 'jarTypeId', 'discount', 'extraCharge', 'note', 'deleted', 'verified'];
