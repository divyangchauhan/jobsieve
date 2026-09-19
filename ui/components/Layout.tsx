'use client';
import { Settings as SettingsIcon, Bell } from 'lucide-react';
import { UserButton } from '@clerk/nextjs';
import type { ReactNode } from 'react';
import Link from 'next/link';

import { useDarkMode } from '../hooks/useDarkMode';
import { DarkModeToggle } from './DarkModeToggle';
import { SyncButton } from './SyncButton';
import { ErrorBoundary } from './ErrorBoundary';

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
            href="/"
            className="text-xl font-bold text-gray-900 dark:text-white"
          >
            jobsieve
          </Link>
          <div className="flex items-center gap-2">
            <SyncButton />
            <Link
              href="/alerts"
              aria-label="Job alerts"
              className="rounded-md p-2 text-gray-600 dark:text-gray-300"
            >
              <Bell size={18} />
            </Link>
            <Link
              href="/settings"
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              title="Relevance profile settings"
            >
              <SettingsIcon size={16} />
            </Link>
            <DarkModeToggle isDark={isDark} onToggle={toggle} />
            <UserButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
    </div>
  );
}
