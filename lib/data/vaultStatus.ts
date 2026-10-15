// The one answer the documents screen owes the family: can we stop worrying?
// "Ready" means every document is locked under the vault passphrase AND has a
// copy on this device - the two things that matter when a phone is lost or
// there is no signal at the border. Pure, so the card and its test agree.

export type VaultStatus = {
  total: number;
  locked: number;
  onDevice: number;
  allLocked: boolean;
  allOnDevice: boolean;
  ready: boolean;
};

export function vaultStatus(
  docs: { id: string; pin_protected: boolean }[],
  onDeviceIds: Set<string>
): VaultStatus {
  const total = docs.length;
  const locked = docs.filter((d) => d.pin_protected).length;
  const onDevice = docs.filter((d) => onDeviceIds.has(d.id)).length;
  const allLocked = total > 0 && locked === total;
  const allOnDevice = total > 0 && onDevice === total;
  return { total, locked, onDevice, allLocked, allOnDevice, ready: allLocked && allOnDevice };
}
