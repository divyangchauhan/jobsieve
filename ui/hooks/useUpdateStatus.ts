import { useMutation, useQueryClient } from '@tanstack/react-query';

import toast from 'react-hot-toast';
import { updateJobStatus } from '../api/jobs';
import type { JobStatus } from '../types/job';

export function useUpdateStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: JobStatus }) =>
      updateJobStatus(id, status),
    onError: () => toast.error('Could not update status. Please retry.'),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ['jobs'] });
      void queryClient.invalidateQueries({ queryKey: ['job', updated.id] });
    },
  });
}
