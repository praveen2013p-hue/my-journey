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
