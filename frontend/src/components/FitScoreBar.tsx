const MAX_SCORE = 20;

interface Props {
  score: number | null;
}

export function FitScoreBar({ score }: Props) {
  if (score === null) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
        <div className="h-1.5 flex-1 rounded-full bg-gray-200 dark:bg-gray-700" />
        <span className="w-6 text-right">—</span>
      </div>
    );
  }

  const pct = Math.min(100, (score / MAX_SCORE) * 100);
  const color =
    pct >= 75
      ? 'bg-green-500'
      : pct >= 40
        ? 'bg-amber-400'
        : 'bg-gray-400 dark:bg-gray-500';

  return (
    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
      <div className="h-1.5 flex-1 rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className={`h-1.5 rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-6 text-right font-medium">{score}</span>
    </div>
  );
}
