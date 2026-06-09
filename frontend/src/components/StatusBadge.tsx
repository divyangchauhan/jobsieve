import type { JobStatus } from '../types/job';
import { JOB_STATUSES } from '../types/job';

interface Props {
  status: JobStatus;
  onClick?: (next: JobStatus) => void;
}

const STATUS_CLASSES: Record<JobStatus, string> = {
  New: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  Reviewing:
    'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  Applied: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  Skipped: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
} as const;

function nextStatus(current: JobStatus): JobStatus {
  const idx = JOB_STATUSES.indexOf(current);
  return JOB_STATUSES[(idx + 1) % JOB_STATUSES.length] ?? 'New';
}

export function StatusBadge({ status, onClick }: Props) {
  const base =
    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium select-none';
  const interactive = onClick
    ? 'cursor-pointer hover:opacity-80 transition-opacity'
    : '';

  return (
    <span
      className={`${base} ${STATUS_CLASSES[status]} ${interactive}`}
      onClick={onClick ? () => onClick(nextStatus(status)) : undefined}
      title={onClick ? `Click to set → ${nextStatus(status)}` : undefined}
    >
      {status}
    </span>
  );
}
