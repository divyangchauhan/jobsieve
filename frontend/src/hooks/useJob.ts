import { useQuery } from '@tanstack/react-query';

import { getJob } from '../api/jobs';

export function useJob(id: number) {
  return useQuery({
    queryKey: ['job', id],
    queryFn: () => getJob(id),
  });
}
