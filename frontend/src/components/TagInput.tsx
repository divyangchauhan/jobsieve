import { X } from 'lucide-react';
import { useState } from 'react';

interface Props {
  label: string;
  tags: readonly string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

// Free-form tag input: add custom terms with Enter/comma, remove with the chip.
export function TagInput({
  label,
  tags,
  onChange,
  placeholder = 'Add a term and press Enter…',
}: Props) {
  const [input, setInput] = useState('');

  function addTag(raw: string) {
    const term = raw.trim().toLowerCase();
    if (term.length === 0 || tags.includes(term)) return;
    onChange([...tags, term]);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input);
      setInput('');
    } else if (e.key === 'Backspace' && input === '' && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>
      <div className="flex flex-wrap gap-1.5 rounded-md border border-gray-300 bg-white p-2 dark:border-gray-600 dark:bg-gray-800">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-800 dark:bg-red-900 dark:text-red-200"
          >
            {tag}
            <X
              size={12}
              className="cursor-pointer hover:text-red-600"
              onClick={() => onChange(tags.filter((t) => t !== tag))}
            />
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            addTag(input);
            setInput('');
          }}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm focus:outline-none dark:text-white"
        />
      </div>
    </div>
  );
}
