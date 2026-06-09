import { ExternalLink, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { Job, JobStatus } from '../types/job';
import { FitScoreBar } from './FitScoreBar';
import { StatusBadge } from './StatusBadge';

interface Props {
  job: Job;
  onStatusChange: (id: number, status: JobStatus) => void;
}

export function JobCard({ job, onStatusChange }: Props) {
  const postedDate = job.posted_at
    ? new Date(job.posted_at).toLocaleDateString()
    : null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link
            to={`/jobs/${job.id}`}
            className="line-clamp-2 font-semibold text-gray-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-400"
          >
            {job.title}
          </Link>
          <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
            {job.company}
          </p>
        </div>
        <StatusBadge
          status={job.status}
          onClick={(next) => onStatusChange(job.id, next)}
        />
      </div>

      <FitScoreBar score={job.fit_score} />

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium dark:bg-gray-700">
          {job.source}
        </span>

        {job.remote && (
          <span className="flex items-center gap-0.5 rounded bg-teal-50 px-1.5 py-0.5 font-medium text-teal-700 dark:bg-teal-900/30 dark:text-teal-300">
            <MapPin size={10} />
            Remote
          </span>
        )}

        {job.salary && (
          <span className="text-gray-600 dark:text-gray-300">{job.salary}</span>
        )}

        {postedDate && <span>{postedDate}</span>}

        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto flex items-center gap-1 text-blue-500 hover:text-blue-700 dark:text-blue-400"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink size={12} />
          Apply
        </a>
      </div>

      {job.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {job.tags.slice(0, 6).map((tag) => (
            <span
              key={tag}
              className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600 dark:bg-blue-900/20 dark:text-blue-300"
            >
              {tag}
            </span>
          ))}
          {job.tags.length > 6 && (
            <span className="text-xs text-gray-400">
              +{job.tags.length - 6}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
