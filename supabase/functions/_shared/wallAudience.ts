// Who may read a wall message - the same rule as the messages policies in
// migrations 00063/00064, for the one place that decides with the service role:
// push-send. A push preview to someone the policies would not show the
// message to is a leak, so this must never be wider than the database.
//
//   pending (kid's, not approved yet) - parents only
//   audience '{}'                     - everyone on the wall
//   audience [groups]                 - the family (parents and kids); guests
//                                       in one of the groups
//
// The sender is never notified of their own message (handled by the caller).

export type WallReader = {
  role: "owner" | "kid" | "guest";
  /** an active guest's groups (guests_allowlist.labels); [] otherwise */
  guestLabels: string[];
  /** false for a revoked guest */
  active: boolean;
};

export type WallMessage = {
  pending: boolean;
  audience: string[];
};

export function canReadWallMessage(reader: WallReader, msg: WallMessage): boolean {
  if (!reader.active) return false;
  if (reader.role === "owner") return true;
  if (msg.pending) return false;
  if (reader.role === "kid" || msg.audience.length === 0) return true;
  return msg.audience.some((g) => reader.guestLabels.includes(g));
}
