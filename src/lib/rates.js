const pos = (n) => (typeof n === 'number' && n > 0 ? n : null);

/** Rate order: party jar rate / party item rate -> item default -> jar type default. Result = paise. */
export function rateFor(party, item, jarMap) {
  if (!item) return 0;
  const jt = item.jarTypeId;
  if (jt) {
    return pos(party?.jarRates?.[jt]?.rate) ?? pos(party?.itemRates?.[item.id]) ?? pos(item.defaultRate) ?? pos(jarMap?.[jt]?.defaultRate) ?? 0;
  }
  return pos(party?.itemRates?.[item.id]) ?? pos(item.defaultRate) ?? 0;
}

/** Deposit per jar: party jar deposit -> jar type default. Result = paise per jar. */
export function depositPerJar(party, jarTypeId, jarMap) {
  if (!jarTypeId) return 0;
  return pos(party?.jarRates?.[jarTypeId]?.deposit) ?? pos(jarMap?.[jarTypeId]?.defaultDeposit) ?? 0;
}
