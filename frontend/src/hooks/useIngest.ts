import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import { triggerIngest } from '../api/jobs';

export function useIngest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: triggerIngest,
    onSuccess: () => {
      toast.success('Ingestion complete — new jobs loaded');
      void queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
    onError: () => {
      toast.error('Ingestion failed');
    },
  });
}
