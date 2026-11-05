// Turns save/load errors into a friendly i18n key or text. Pure: no i18n or firebase imports.

const CODE_KEY = {
  OFFLINE_BILL: 'err.offlineBill',
  BILL_CONNECTION: 'err.billConn',
  ENTRY_GONE: 'err.entryGone',
  ENTRY_DELETED: 'err.entryDeleted',
  ENTRY_ACTIVE: 'err.entryActive',
  NOT_RECEIPT: 'err.notReceipt',
  'permission-denied': 'err.denied',
  unavailable: 'err.network',
  'deadline-exceeded': 'err.network',
  'failed-precondition': 'err.network',
  'resource-exhausted': 'err.busy',
};

const bare = (c) => String(c || '').replace(/^firestore\//, '');

/** i18n key for an error (never null). */
export function errKey(e) {
  const code = bare(e && e.code);
  if (CODE_KEY[code]) return CODE_KEY[code];
  const msg = String((e && e.message) || '');
  if (/PERMISSION_DENIED|insufficient permissions/i.test(msg)) return 'err.denied';
  return 'err.unknown';
}

const TECHNICAL = /PERMISSION_DENIED|FirebaseError|firestore|evaluation error|\bL\d+\b|\bat \S+:\d+|Error:|undefined|\[object|\{|\}/i;

/** Friendly text for an error. t = translate function from useT(). */
export function errText(e, t) {
  const key = errKey(e);
  if (key === 'err.unknown') {
    const msg = e && typeof e.message === 'string' ? e.message.trim() : '';
    if (msg && msg.length <= 160 && !TECHNICAL.test(msg)) return msg;
  }
  return t(key);
}
