export interface NormalizedJob {
  readonly source: string;
  readonly sourceJobId?: string;
  readonly title: string;
  readonly company: string;
  readonly url: string;
  readonly postedAt?: Date;
  readonly tags: readonly string[];
  readonly remote: boolean;
  readonly salary?: string;
  readonly description?: string;
}
