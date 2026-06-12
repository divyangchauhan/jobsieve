export interface NotionColumnMap {
  readonly name: string;
  readonly position: string;
  readonly link: string;
  readonly stage: string;
}

export const DEFAULT_COLUMN_MAP = {
  name: 'Company',
  position: 'Position',
  link: 'Link',
  stage: 'Stage',
} as const satisfies NotionColumnMap;
