import { NormalizedJob } from './normalized-job.interface';

export interface SourceAdapter {
  readonly failures?: number;
  readonly name: string;
  fetchJobs(): Promise<NormalizedJob[]>;
}
