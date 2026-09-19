'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import { Toaster } from 'react-hot-toast';
function UserCache({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, staleTime: 30000 } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <Toaster position="bottom-right" />
      {children}
    </QueryClientProvider>
  );
}
export function Providers({ children }: { children: React.ReactNode }) {
  const { userId, isLoaded } = useAuth();
  useEffect(() => {
    if (isLoaded && 'serviceWorker' in navigator)
      void navigator.serviceWorker
        .getRegistration('/')
        .then((r) =>
          r?.active?.postMessage({ type: 'account', userId: userId ?? null }),
        );
  }, [userId, isLoaded]);
  // Remount the complete cache on account switch; no previous user's profile/status survives.
  return <UserCache key={userId ?? 'signed-out'}>{children}</UserCache>;
}
