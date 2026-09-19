export type JobStatus = 'New' | 'Reviewing' | 'Applied' | 'Skipped';

export const JOB_STATUSES: readonly JobStatus[] = [
  'New',
  'Reviewing',
  'Applied',
  'Skipped',
] as const;

export interface JobSummary {
  id: number;
  source: string;
  title: string;
  company: string;
  url: string;
  posted_at: string | null;
  tags: string[];
  remote: boolean;
  salary: string | null;
  fit_score: number | null;
  status: JobStatus;
  first_seen_at: string;
  last_seen_at: string;
}

export interface Job extends JobSummary {
  dedup_key: string;
  source_job_id: string | null;
  description: string | null;
}

export interface PaginatedJobs {
  data: JobSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface JobsQuery {
  status?: string;
  source?: string;
  minFitScore?: number;
  remote?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}
