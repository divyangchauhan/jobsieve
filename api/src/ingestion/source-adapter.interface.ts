import { NormalizedJob } from './normalized-job.interface.js';

export interface SourceAdapter {
  readonly name: string;
  fetchJobs(): Promise<NormalizedJob[]>;
}
