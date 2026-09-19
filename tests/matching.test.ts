import { describe, it, expect } from 'vitest';
import { matchesAlert } from '../lib/alerts/matching';
import { matchesProfile } from '../lib/jobs';
import { fixtureJob, fixtureUser } from './fixtures';
import { profileSchema } from '../lib/profile/schema';
describe('per-user alert matching', () => {
  it('matches recent jobs for the selected role', () =>
    expect(matchesAlert(fixtureJob(), fixtureUser())).toBe(true));
  it.each([4, 25, 100])(
    'rejects jobs posted %s hours ago despite recent discovery',
    (hours) =>
      expect(
        matchesAlert(
          fixtureJob({ posted_at: new Date(Date.now() - hours * 3600000) }),
          fixtureUser(),
        ),
      ).toBe(false),
  );
  it('rejects future timestamps', () =>
    expect(
      matchesAlert(
        fixtureJob({ posted_at: new Date(Date.now() + 60000) }),
        fixtureUser(),
      ),
    ).toBe(false));
  it('rejects invalid dates', () =>
    expect(
      matchesAlert(fixtureJob({ posted_at: new Date('bad') }), fixtureUser()),
    ).toBe(false));
  it('does not treat unknown posting times as fresh by default', () =>
    expect(matchesAlert(fixtureJob({ posted_at: null }), fixtureUser())).toBe(
      false,
    ));
  it('allows unknown times only with explicit opt-in after a source baseline', () => {
    const user = fixtureUser();
    user.alert_settings.includeDiscovered = true;
    expect(matchesAlert(fixtureJob({ posted_at: null }), user)).toBe(true);
    expect(
      matchesAlert(
        fixtureJob({ posted_at: null, discovery_eligible: false }),
        user,
      ),
    ).toBe(false);
  });
  it('does not flood a new subscriber with pre-existing jobs', () =>
    expect(
      matchesAlert(
        fixtureJob({ first_seen_at: new Date(Date.now() - 86400000) }),
        fixtureUser(),
      ),
    ).toBe(false));
  it.each(['Applied', 'Skipped'] as const)(
    'does not alert for %s jobs',
    (status) =>
      expect(matchesAlert(fixtureJob({ status }), fixtureUser())).toBe(false),
  );
  it('honors unsubscribe', () => {
    const user = fixtureUser();
    user.alert_settings.enabled = false;
    expect(matchesAlert(fixtureJob(), user)).toBe(false);
  });
  it('hard-gates role family for alerts even with a zero score floor', () =>
    expect(
      matchesAlert(
        fixtureJob({
          title: 'Accountant',
          description: 'Finance team',
          tags: [],
        }),
        fixtureUser(),
      ),
    ).toBe(false));
  it('matches company names case-insensitively without partial-name collisions', () => {
    const user = fixtureUser();
    user.profile.companies = ['acme'];
    expect(matchesAlert(fixtureJob(), user)).toBe(true);
    expect(matchesAlert(fixtureJob({ company: 'Acme Else' }), user)).toBe(
      false,
    );
  });
  it('combines company names OR sector keywords, then AND job keywords', () => {
    const user = fixtureUser();
    user.profile.companies = ['Other'];
    user.profile.companyKeywords = ['backend-saas'];
    user.profile.jobKeywords = ['typescript'];
    expect(matchesAlert(fixtureJob({ company: 'Vercel' }), user)).toBe(true);
    expect(matchesAlert(fixtureJob({ company: 'Acme' }), user)).toBe(false);
    user.profile.jobKeywords = ['ruby'];
    expect(matchesAlert(fixtureJob({ company: 'Vercel' }), user)).toBe(false);
  });
  it('keeps settings independent for two users', () => {
    const a = fixtureUser(),
      b = fixtureUser();
    b.profile.companies = ['Other'];
    expect(matchesAlert(fixtureJob(), a)).toBe(true);
    expect(matchesAlert(fixtureJob(), b)).toBe(false);
  });
  it('applies exclusions, remote restrictions, and score floor', () => {
    const user = fixtureUser();
    user.profile.excludeTerms = ['senior'];
    expect(matchesAlert(fixtureJob(), user)).toBe(false);
    user.profile.excludeTerms = [];
    expect(matchesAlert(fixtureJob({ remote: false }), user)).toBe(false);
    user.profile.minFitScore = 100;
    expect(matchesAlert(fixtureJob(), user)).toBe(false);
  });
  it('preserves region filtering', () => {
    const user = fixtureUser();
    user.profile.regionEligibility = ['india-eligible'];
    expect(
      matchesProfile(fixtureJob({ description: 'US only' }), user.profile),
    ).toBe(false);
  });
  it('rejects malformed or excessively large profiles', () => {
    expect(
      profileSchema.safeParse({
        ...fixtureUser().profile,
        companies: Array(51).fill('acme'),
      }).success,
    ).toBe(false);
    expect(
      profileSchema.safeParse({
        ...fixtureUser().profile,
        locationTypes: ['mars'],
      }).success,
    ).toBe(false);
  });
});
