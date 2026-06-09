export type JobStatus = 'New' | 'Reviewing' | 'Applied' | 'Skipped';

export const JOB_STATUSES: readonly JobStatus[] = [
  'New',
  'Reviewing',
  'Applied',
  'Skipped',
] as const;

export interface Job {
  id: number;
  dedup_key: string;
  source: string;
  source_job_id: string | null;
  title: string;
  company: string;
  url: string;
  posted_at: string | null;
  tags: string[];
  remote: boolean;
  salary: string | null;
  description: string | null;
  fit_score: number | null;
  status: JobStatus;
  notion_page_id: string | null;
  first_seen_at: string;
  last_seen_at: string;
}

export interface PaginatedJobs {
  data: Job[];
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
