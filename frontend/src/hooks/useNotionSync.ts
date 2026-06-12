import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import toast from 'react-hot-toast';

import { syncJobToNotion } from '../api/jobs';

export function useNotionSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => syncJobToNotion(id),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ['jobs'] });
      void queryClient.invalidateQueries({ queryKey: ['job', updated.id] });
    },
    onError: (err) => {
      const message =
        axios.isAxiosError(err)
          ? (err.response?.data as { message?: string })?.message ?? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to sync to Notion';
      toast.error(message);
    },
  });
}
