// Shared ingestion must never discard titles based on one user's role preferences.
// All filtering happens against the authenticated user's profile.
export function passesTitleFilter(_title: string): boolean {
  return true;
}
