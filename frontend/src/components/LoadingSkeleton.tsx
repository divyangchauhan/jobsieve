function CardSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-2 flex justify-between">
        <div className="space-y-2">
          <div className="h-4 w-48 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-3 w-32 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
        <div className="h-5 w-16 rounded-full bg-gray-200 dark:bg-gray-700" />
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700" />
      <div className="mt-3 flex gap-2">
        <div className="h-4 w-20 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-4 w-14 rounded bg-gray-200 dark:bg-gray-700" />
      </div>
    </div>
  );
}

interface Props {
  count?: number;
}

export function LoadingSkeleton({ count = 6 }: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-64 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="h-5 w-40 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700" />
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-3 rounded bg-gray-200 dark:bg-gray-700"
            style={{ width: `${60 + Math.random() * 40}%` }}
          />
        ))}
      </div>
    </div>
  );
}
