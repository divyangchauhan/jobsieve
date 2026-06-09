import { useMutation, useQueryClient } from '@tanstack/react-query';

import { updateJobStatus } from '../api/jobs';
import type { JobStatus } from '../types/job';

export function useUpdateStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: JobStatus }) =>
      updateJobStatus(id, status),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ['jobs'] });
      void queryClient.invalidateQueries({ queryKey: ['job', updated.id] });
    },
  });
}
