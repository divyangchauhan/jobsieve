import { RefreshCw } from 'lucide-react';

import { useIngest } from '../hooks/useIngest';

export function SyncButton() {
  const { mutate, isPending } = useIngest();

  return (
    <button
      onClick={() => mutate()}
      disabled={isPending}
      className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-600"
    >
      <RefreshCw size={14} className={isPending ? 'animate-spin' : ''} />
      {isPending ? 'Syncing…' : 'Sync jobs'}
    </button>
  );
}
