/**
 * BRIEF.md §2: "Exactly 2 Google accounts, allow-listed by env
 * ALLOWED_EMAILS (comma-separated). Anyone else is signed out."
 */

export function getAllowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailAllowed(email: string): boolean {
  return getAllowedEmails().includes(email.trim().toLowerCase());
}

/**
 * The first email in ALLOWED_EMAILS is treated as the account owner
 * (Praveen's own) - BRIEF.md §10: "Only the owner account sees the
 * connect button" for Zerodha, since the Kite login is tied to his own
 * Zerodha account, not his wife's.
 */
export function isOwnerEmail(email: string): boolean {
  const [owner] = getAllowedEmails();
  return owner !== undefined && email.trim().toLowerCase() === owner;
}
