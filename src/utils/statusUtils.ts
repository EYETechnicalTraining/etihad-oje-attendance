/**
 * Checks whether an attendance or roster status is considered "Pending".
 * Handles casing variations ('pending', 'PENDING'), roster codes ('8D', '8d'), and 'N/A'.
 */
export const isPendingStatus = (status?: string | null): boolean => {
  if (!status) return true;
  const s = status.toString().trim().toLowerCase();
  return s === 'pending' || s === '8d' || s === 'n/a' || s === 'na' || s.includes('pending');
};

/**
 * Checks whether an attendance or roster status is considered "No Show".
 * Handles casing variations ('no show', 'NO SHOW', 'noshow'), and roster code ('NS').
 */
export const isNoShowStatus = (status?: string | null): boolean => {
  if (!status) return false;
  const s = status.toString().trim().toLowerCase();
  return s === 'no show' || s === 'noshow' || s === 'ns' || s.includes('no show');
};

/**
 * Normalizes trainee staff ID / number:
 * - Upper case, trimmed
 * - Strips Staff #, #, EY- prefixes
 * - Removes spaces (e.g. EYETT 106 -> EYETT106)
 * - Removes leading zeros after prefix (e.g. EYETT099 -> EYETT99)
 */
export const normalizeTraineeId = (id?: string | null): string => {
  if (!id) return '';
  let str = id.toString().trim().toUpperCase();
  str = str.replace(/^STAFF\s*#?\s*/i, '').replace(/^#\s*/, '');
  str = str.replace(/^EY-/, '');
  str = str.replace(/\s+/g, '');
  str = str.replace(/^EYETT0+([1-9]\d*)$/, 'EYETT$1');
  return str;
};
