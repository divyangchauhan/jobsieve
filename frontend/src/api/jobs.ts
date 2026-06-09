import { apiClient } from './client';
import type { Job, JobsQuery, JobStatus, PaginatedJobs } from '../types/job';

export async function getJobs(query: JobsQuery): Promise<PaginatedJobs> {
  const { data } = await apiClient.get<PaginatedJobs>('/jobs', {
    params: query,
  });
  return data;
}

export async function getJob(id: number): Promise<Job> {
  const { data } = await apiClient.get<Job>(`/jobs/${id}`);
  return data;
}

export async function updateJobStatus(
  id: number,
  status: JobStatus,
): Promise<Job> {
  const { data } = await apiClient.patch<Job>(`/jobs/${id}`, { status });
  return data;
}

export async function triggerIngest(): Promise<{ ok: boolean }> {
  const { data } = await apiClient.post<{ ok: boolean }>('/admin/ingest');
  return data;
}
