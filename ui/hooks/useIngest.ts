import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { ingestionBatches, ingestSource, finishIngestion } from '@/app/actions';
export function useIngest() {
  const client = useQueryClient();
  const [progress, setProgress] = useState('');
  const mutation = useMutation({
    mutationFn: async () => {
      const batches = await ingestionBatches();
      let failed = 0,
        completed = 0;
      for (let i = 0; i < batches.length; i++) {
        setProgress(`${i + 1}/${batches.length}`);
        try {
          const result = await ingestSource(batches[i]);
          if (result.status === 'failed') failed++;
          if (result.status === 'complete') completed++;
        } catch {
          failed++;
        }
      }
      await finishIngestion();
      return { failed, completed };
    },
    onSuccess: ({ failed, completed }) => {
      if (failed)
        toast.error(
          `${failed} source batches failed; available jobs have been saved.`,
        );
      else
        toast.success(
          completed
            ? 'Refresh complete'
            : 'Jobs were refreshed recently. Try again in a few minutes.',
        );
    },
    onError: () =>
      toast.error('Refresh could not finish. You can safely retry.'),
    onSettled: async () => {
      setProgress('');
      // Refresh once even after partial failure. Each batch can save jobs,
      // but fetching and ranking the same page after every batch is wasteful.
      await client.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
  return { ...mutation, progress };
}
