import type { Profile } from './profile/schema';
import { COMPANIES } from './registry/company-registry';
import {
  AMBIGUOUS_STACK_TERMS,
  REGION_LOCK_TERMS,
  UNRESTRICTED_REGIONS,
  resolveRoleKeywords,
  resolveSeniorityKeywords,
} from './scoring/taxonomy';

// Keep matching inside Postgres so descriptions do not cross the network just
// to rank a page or decide whether an alert should be queued.
export function jobSelection(
  profile: Profile,
  userId: string,
  now = new Date(),
) {
  const values: unknown[] = [userId];
  const param = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  const title = 'lower(j.title)';
  const description = "lower(COALESCE(j.description,''))";
  const tags =
    "lower(array_to_string(ARRAY(SELECT jsonb_array_elements_text(j.tags)),' '))";
  const text = `(${title} || ' ' || ${description} || ' ' || ${tags})`;
  const any = (field: string, phrases: readonly string[]) => {
    const normalized = phrases
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);
    if (!normalized.length) return 'FALSE';
    const pattern = `(?<![a-z0-9])(?:${normalized.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![a-z0-9])`;
    return `${field} ~ ${param(pattern)}`;
  };
  const roleKeywords = resolveRoleKeywords(profile.roleFamilies);
  const roleTitle = any(title, roleKeywords);
  const roleDescription = any(description, roleKeywords);
  const role = profile.roleFamilies.length
    ? `(CASE WHEN ${roleTitle} THEN 5 WHEN ${roleDescription} THEN 2 ELSE 0 END)`
    : '0';
  const seniorities = resolveSeniorityKeywords(profile.seniorities);
  const seniority = `(CASE WHEN ${any(title, seniorities)} THEN 3 WHEN ${any(description, seniorities)} THEN 1 ELSE 0 END)`;
  const stack = profile.stack.map(
    (term) =>
      `(CASE WHEN ${any(title, [term])} OR ${any(tags, [term])} THEN 2 ${AMBIGUOUS_STACK_TERMS.has(term.toLowerCase()) ? '' : `WHEN ${any(description, [term])} THEN 1`} ELSE 0 END)`,
  );
  const location = profile.locationTypes.includes('remote')
    ? '(CASE WHEN j.remote THEN 1 ELSE 0 END)'
    : '0';
  const roleMatch = () =>
    profile.roleFamilies.length
      ? any(`(${title} || ' ' || ${description})`, roleKeywords)
      : 'TRUE';
  const sum = [role, seniority, ...stack, location].join(' + ');
  const score = profile.roleFamilies.length
    ? `(CASE WHEN ${roleTitle} OR ${roleDescription} THEN ${sum} ELSE 0 END)`
    : `(${sum})`;
  const where: string[] = [];
  if (profile.excludeTerms.length)
    where.push(`NOT (${any(title, profile.excludeTerms)})`);
  if (profile.locationTypes.length)
    where.push(
      `(${profile.locationTypes.map((t) => (t === 'remote' ? 'j.remote' : t === 'hybrid' ? `strpos(${text},'hybrid')>0` : `${text} ~ 'on[- ]?site'`)).join(' OR ')})`,
    );
  if (
    profile.regionEligibility.length &&
    !profile.regionEligibility.some((r) => UNRESTRICTED_REGIONS.has(r))
  ) {
    for (const [region, phrases] of Object.entries(REGION_LOCK_TERMS)) {
      if (!profile.regionEligibility.includes(region))
        for (const phrase of phrases)
          where.push(`strpos(${text},${param(phrase.toLowerCase())})=0`);
    }
  }
  if (profile.freshnessDays !== null)
    where.push(
      `j.last_seen_at>=${param(new Date(now.getTime() - profile.freshnessDays * 86400000))}`,
    );
  const companies = profile.companies ?? [],
    keywords = profile.companyKeywords ?? [];
  if (companies.length || keywords.length) {
    const catalogMatches = COMPANIES.filter((c) =>
      keywords.some((k) =>
        `${c.name} ${c.domain ?? ''}`.toLowerCase().includes(k.toLowerCase()),
      ),
    ).map((c) => c.name.toLowerCase());
    where.push(
      `(lower(j.company)=ANY(${param([...companies.map((c) => c.toLowerCase()), ...catalogMatches])}::text[])${keywords.map((k) => ` OR strpos(lower(j.company)||' ',${param(k.toLowerCase())})>0`).join('')})`,
    );
  }
  if (profile.jobKeywords?.length) where.push(any(text, profile.jobKeywords));
  return {
    values,
    param,
    where,
    score,
    roleMatch,
    status: "COALESCE(u.status,'New')",
    join: 'LEFT JOIN user_jobs u ON u.job_id=j.id AND u.user_id=$1',
  };
}
