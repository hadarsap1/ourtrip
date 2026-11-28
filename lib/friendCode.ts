/** A friend code (00110) is 8 characters; a family kid's tablet code is 6. */
export const FRIEND_CODE_LENGTH = 8;

export function isFriendCode(code: string): boolean {
  return code.trim().length === FRIEND_CODE_LENGTH;
}

export function isPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}
