import type { AppUser } from '../users';
import type { StoredJob } from '../jobs';
import { matchesProfile, matchesAlertRole, score } from '../jobs';
import { defaultAlerts } from './schema';
export function matchesAlert(
  job: StoredJob & { discovery_eligible?: boolean },
  user: AppUser,
  now = new Date(),
): boolean {
  const settings = { ...defaultAlerts(), ...user.alert_settings };
  if (!settings.enabled || !settings.enabledAt || !settings.channels.length)
    return false;
  if (job.first_seen_at.getTime() < new Date(settings.enabledAt).getTime())
    return false;
  if (job.status === 'Applied' || job.status === 'Skipped') return false;
  const date =
    job.posted_at ??
    (settings.includeDiscovered && job.discovery_eligible
      ? job.first_seen_at
      : null);
  if (!date || !Number.isFinite(date.getTime())) return false;
  const age = now.getTime() - date.getTime();
  if (age < 0 || age > settings.maxAgeHours * 3600000) return false;
  return (
    matchesProfile(job, user.profile, now) &&
    matchesAlertRole(job, user.profile) &&
    score(job, user.profile) >= (user.profile.minFitScore ?? 0)
  );
}
