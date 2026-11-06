// Key display (CLAUDE.md rule 4): only the last 4 characters are ever shown. Used by S08.

/** Last 4 characters of a secret, computed once when it is stored. */
export function last4(secret: string): string {
  return secret.trim().slice(-4);
}

/** "••••" + last 4 characters. */
export function maskKey(lastFour: string): string {
  return `••••${lastFour.slice(-4)}`;
}
