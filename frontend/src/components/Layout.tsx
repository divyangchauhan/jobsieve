import { Settings as SettingsIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { useDarkMode } from '../hooks/useDarkMode';
import { DarkModeToggle } from './DarkModeToggle';
import { SyncButton } from './SyncButton';

interface Props {
  children: ReactNode;
}

export function Layout({ children }: Props) {
  const { isDark, toggle } = useDarkMode();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link
            to="/"
            className="text-xl font-bold text-gray-900 dark:text-white"
          >
            jobsieve
          </Link>
          <div className="flex items-center gap-2">
            <SyncButton />
            <Link
              to="/settings"
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              title="Relevance profile settings"
            >
              <SettingsIcon size={16} />
            </Link>
            <DarkModeToggle isDark={isDark} onToggle={toggle} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
