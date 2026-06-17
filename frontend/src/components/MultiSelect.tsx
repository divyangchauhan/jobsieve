import { Check, ChevronDown, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface Props {
  label: string;
  options: readonly string[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

// Headless searchable multi-select: type-to-filter + checkbox toggle. No extra
// dependency — built on the existing Tailwind + lucide-react setup.
export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder = 'Search…',
}: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const visible = options.filter((o) =>
    o.toLowerCase().includes(filter.toLowerCase()),
  );

  function toggle(option: string) {
    if (selected.includes(option)) {
      onChange(selected.filter((s) => s !== option));
    } else {
      onChange([...selected, option]);
    }
  }

  return (
    <div className="space-y-1.5" ref={containerRef}>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-[2.25rem] w-full items-center justify-between gap-2 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-left text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        >
          <span className="flex flex-1 flex-wrap gap-1">
            {selected.length === 0 ? (
              <span className="text-gray-400">None selected</span>
            ) : (
              selected.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                >
                  {s}
                  <X
                    size={12}
                    className="cursor-pointer hover:text-blue-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(s);
                    }}
                  />
                </span>
              ))
            )}
          </span>
          <ChevronDown size={16} className="shrink-0 text-gray-400" />
        </button>

        {open && (
          <div className="absolute z-20 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
            <input
              autoFocus
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={placeholder}
              className="w-full border-b border-gray-200 bg-transparent px-2.5 py-1.5 text-sm focus:outline-none dark:border-gray-700 dark:text-white"
            />
            <ul className="max-h-52 overflow-auto py-1">
              {visible.length === 0 && (
                <li className="px-2.5 py-1.5 text-sm text-gray-400">
                  No matches
                </li>
              )}
              {visible.map((option) => {
                const isSelected = selected.includes(option);
                return (
                  <li key={option}>
                    <button
                      type="button"
                      onClick={() => toggle(option)}
                      className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-sm hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                      {option}
                      {isSelected && (
                        <Check size={14} className="text-blue-600" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
