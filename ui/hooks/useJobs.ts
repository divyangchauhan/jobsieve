import { useQuery } from '@tanstack/react-query';

import { getJobs } from '../api/jobs';
import type { JobsQuery } from '../types/job';

export function useJobs(query: JobsQuery) {
  return useQuery({
    queryKey: ['jobs', query],
    queryFn: () => getJobs(query),
  });
}
