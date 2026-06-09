import { ArrowLeft, ExternalLink, MapPin } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

import { FitScoreBar } from '../components/FitScoreBar';
import { DetailSkeleton } from '../components/LoadingSkeleton';
import { StatusBadge } from '../components/StatusBadge';
import { useJob } from '../hooks/useJob';
import { useUpdateStatus } from '../hooks/useUpdateStatus';
import type { JobStatus } from '../types/job';
import { JOB_STATUSES } from '../types/job';

export function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const jobId = Number(id);
  const { data: job, isLoading, isError } = useJob(jobId);
  const { mutate: updateStatus, isPending } = useUpdateStatus();

  if (isLoading) {
    return <DetailSkeleton />;
  }

  if (isError || !job) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-950">
        <p className="text-red-600 dark:text-red-400">Job not found.</p>
        <button
          onClick={() => navigate(-1)}
          className="mt-3 text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          Go back
        </button>
      </div>
    );
  }

  const postedDate = job.posted_at
    ? new Date(job.posted_at).toLocaleDateString()
    : null;
  const firstSeen = new Date(job.first_seen_at).toLocaleDateString();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <ArrowLeft size={14} />
        Back
      </button>

      <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              {job.title}
            </h1>
            <p className="mt-1 text-base text-gray-600 dark:text-gray-400">
              {job.company}
            </p>
          </div>
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <ExternalLink size={14} />
            Apply
          </a>
        </div>

        <div className="mb-4">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Fit score
          </p>
          <FitScoreBar score={job.fit_score} />
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <span className="rounded bg-gray-100 px-2 py-0.5 text-sm font-medium dark:bg-gray-700 dark:text-gray-200">
            {job.source}
          </span>
          {job.remote && (
            <span className="flex items-center gap-1 rounded bg-teal-50 px-2 py-0.5 text-sm font-medium text-teal-700 dark:bg-teal-900/30 dark:text-teal-300">
              <MapPin size={12} />
              Remote
            </span>
          )}
          {job.salary && (
            <span className="rounded bg-gray-100 px-2 py-0.5 text-sm dark:bg-gray-700 dark:text-gray-200">
              {job.salary}
            </span>
          )}
        </div>

        <div className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          {postedDate && <span>Posted {postedDate} · </span>}
          <span>First seen {firstSeen}</span>
        </div>

        {job.tags.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {job.tags.map((tag) => (
              <span
                key={tag}
                className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-600 dark:bg-blue-900/20 dark:text-blue-300"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="border-t border-gray-100 pt-4 dark:border-gray-700">
          <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            Status
          </p>
          <div className="flex flex-wrap gap-2">
            {JOB_STATUSES.map((s) => (
              <button
                key={s}
                disabled={isPending}
                onClick={() =>
                  updateStatus({ id: job.id, status: s as JobStatus })
                }
                className={`rounded-full px-3 py-1 text-xs font-medium transition-opacity disabled:opacity-50 ${
                  job.status === s
                    ? 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-gray-800'
                    : 'opacity-60 hover:opacity-100'
                }`}
              >
                <StatusBadge status={s as JobStatus} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {job.description && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Description
          </h2>
          <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
            {job.description}
          </div>
        </div>
      )}
    </div>
  );
}
