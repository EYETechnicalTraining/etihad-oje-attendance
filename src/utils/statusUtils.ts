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
