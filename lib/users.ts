import type { Database } from './db/types';
import { defaultProfile, profileSchema, type Profile } from './profile/schema';
import { defaultAlerts, type SavedAlerts } from './alerts/schema';
export interface AppUser {
  id: string;
  email: string | null;
  profile: Profile;
  alert_settings: SavedAlerts;
  created_at: Date;
}
export async function ensureUser(
  db: Database,
  id: string,
  email: string | null,
): Promise<AppUser> {
  const { rows: existing } = await db.query<AppUser>(
    'SELECT * FROM app_users WHERE id=$1 AND email IS NOT DISTINCT FROM $2',
    [id, email],
  );
  if (existing[0]) return existing[0];
  const {
    rows: [user],
  } = await db.query<AppUser>(
    `INSERT INTO app_users(id,email,profile,alert_settings) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET email=excluded.email WHERE app_users.email IS DISTINCT FROM excluded.email RETURNING *`,
    [
      id,
      email,
      JSON.stringify(defaultProfile()),
      JSON.stringify(defaultAlerts()),
    ],
  );
  // Another request may have created/refreshed this identity concurrently.
  return (
    user ??
    (await db.query<AppUser>('SELECT * FROM app_users WHERE id=$1', [id]))
      .rows[0]
  );
}
export async function saveProfile(
  db: Database,
  userId: string,
  input: unknown,
) {
  const profile = profileSchema.parse(input);
  await db.query(
    'UPDATE app_users SET profile=$2 WHERE id=$1 AND profile IS DISTINCT FROM $2::jsonb',
    [userId, JSON.stringify(profile)],
  );
  return profile;
}
