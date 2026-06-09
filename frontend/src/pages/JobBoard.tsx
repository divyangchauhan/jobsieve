import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { ErrorBoundary } from '../components/ErrorBoundary';
import { FilterBar } from '../components/FilterBar';
import { JobCard } from '../components/JobCard';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { useJobs } from '../hooks/useJobs';
import { useUpdateStatus } from '../hooks/useUpdateStatus';
import type { JobsQuery } from '../types/job';

const DEFAULT_QUERY: JobsQuery = { page: 1, limit: 20 };

export function JobBoard() {
  const [query, setQuery] = useState<JobsQuery>(DEFAULT_QUERY);
  const { data, isLoading, isError, error } = useJobs(query);
  const { mutate: updateStatus } = useUpdateStatus();

  function patch(partial: Partial<JobsQuery>) {
    setQuery((q) => ({ ...q, ...partial }));
  }

  const totalPages = data ? Math.ceil(data.total / (data.limit || 20)) : 0;
  const currentPage = data?.page ?? 1;

  return (
    <div className="space-y-4">
      <ErrorBoundary>
        <FilterBar
          query={query}
          onChange={patch}
          onReset={() => setQuery(DEFAULT_QUERY)}
        />
      </ErrorBoundary>

      {isLoading && <LoadingSkeleton count={6} />}

      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-950">
          <p className="text-sm text-red-600 dark:text-red-400">
            {error instanceof Error ? error.message : 'Failed to load jobs'}
          </p>
        </div>
      )}

      {data && data.data.length === 0 && !isLoading && (
        <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center dark:border-gray-600">
          <p className="text-gray-500 dark:text-gray-400">
            No jobs match your filters.
          </p>
        </div>
      )}

      {data && data.data.length > 0 && (
        <>
          <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
            <span>
              {data.total} job{data.total !== 1 ? 's' : ''} found
            </span>
            {totalPages > 1 && (
              <span>
                Page {currentPage} of {totalPages}
              </span>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.data.map((job) => (
              <ErrorBoundary key={job.id}>
                <JobCard
                  job={job}
                  onStatusChange={(id, status) => updateStatus({ id, status })}
                />
              </ErrorBoundary>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => patch({ page: currentPage - 1 })}
                disabled={currentPage <= 1}
                className="rounded-md p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-700"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => patch({ page: currentPage + 1 })}
                disabled={currentPage >= totalPages}
                className="rounded-md p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-700"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
