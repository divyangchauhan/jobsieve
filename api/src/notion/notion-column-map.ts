export interface NotionColumnMap {
  readonly title: string;
  readonly company: string;
  readonly url: string;
  readonly status: string;
  readonly fitScore: string;
  readonly source: string;
  readonly postedAt: string;
  readonly tags: string;
}

export const DEFAULT_COLUMN_MAP = {
  title: 'Name',
  company: 'Company',
  url: 'URL',
  status: 'Status',
  fitScore: 'FitScore',
  source: 'Source',
  postedAt: 'PostedAt',
  tags: 'Tags',
} as const satisfies NotionColumnMap;
