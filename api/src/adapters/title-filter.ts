const ALLOWLIST_RE =
  /(backend|back-end|engineer|developer|infrastructure|platform|protocol|distributed|golang|typescript|python|sre|staff|senior|lead|principal)/i;

let _enabled: boolean | null = null;

function isEnabled(): boolean {
  if (_enabled === null) {
    _enabled = process.env['TITLE_ALLOWLIST_ENABLED'] === 'true';
  }
  return _enabled;
}

export function passesTitleFilter(title: string): boolean {
  return !isEnabled() || ALLOWLIST_RE.test(title);
}
