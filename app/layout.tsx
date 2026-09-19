import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata } from 'next';
import { Providers } from './providers';
import './globals.css';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'JobSieve',
  description: 'Your jobs, your criteria. Find and act on new opportunities.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'JobSieve', statusBarStyle: 'default' },
  icons: { icon: '/icon.svg', apple: '/icons/apple-touch-icon.png' },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/settings"
    >
      <html lang="en" suppressHydrationWarning>
        <body>
          <Providers>{children}</Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
