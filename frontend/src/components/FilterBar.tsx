import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { JobsQuery } from '../types/job';
import { JOB_STATUSES } from '../types/job';

interface Props {
  query: JobsQuery;
  onChange: (patch: Partial<JobsQuery>) => void;
  onReset: () => void;
}

function useDebounce(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export function FilterBar({ query, onChange, onReset }: Props) {
  const [searchInput, setSearchInput] = useState(query.search ?? '');
  const debouncedSearch = useDebounce(searchInput, 300);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const patch: Partial<JobsQuery> = { page: 1 };
    if (debouncedSearch) patch.search = debouncedSearch;
    onChange(patch);
  }, [debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
      <div className="relative min-w-48 flex-1">
        <Search
          size={14}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          type="text"
          placeholder="Search title or company…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full rounded-md border border-gray-300 bg-transparent py-1.5 pl-8 pr-3 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:text-white dark:placeholder-gray-500"
        />
      </div>

      <select
        value={query.status ?? ''}
        onChange={(e) =>
          {
          const patch: Partial<JobsQuery> = { page: 1 };
          if (e.target.value) patch.status = e.target.value;
          onChange(patch);
        }
        }
        className="rounded-md border border-gray-300 bg-white py-1.5 pl-2 pr-6 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
      >
        <option value="" className="bg-white dark:bg-gray-800">All statuses</option>
        {JOB_STATUSES.map((s) => (
          <option key={s} value={s} className="bg-white dark:bg-gray-800">
            {s}
          </option>
        ))}
      </select>

      <label className="flex cursor-pointer items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
        <input
          type="checkbox"
          checked={query.remote === true}
          onChange={(e) =>
            {
            const patch: Partial<JobsQuery> = { page: 1 };
            if (e.target.checked) patch.remote = true;
            onChange(patch);
          }
          }
          className="rounded"
        />
        Remote only
      </label>

      <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
        <label htmlFor="fitScore">Min score</label>
        <input
          id="fitScore"
          type="range"
          min={0}
          max={20}
          value={query.minFitScore ?? 0}
          onChange={(e) =>
            {
              const patch: Partial<JobsQuery> = { page: 1 };
              const score = Number(e.target.value);
              if (score > 0) patch.minFitScore = score;
              onChange(patch);
            }
          }
          className="w-24"
        />
        <span className="w-4 text-center font-medium">
          {query.minFitScore ?? 0}
        </span>
      </div>

      <button
        onClick={onReset}
        className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
        title="Reset filters"
      >
        <X size={14} />
        Reset
      </button>
    </div>
  );
}
