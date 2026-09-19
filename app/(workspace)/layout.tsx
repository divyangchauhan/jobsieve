import { auth } from '@clerk/nextjs/server';
import { Layout } from '@/ui/components/Layout';
export const dynamic = 'force-dynamic';
export const maxDuration = 240;
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await auth.protect();
  return <Layout>{children}</Layout>;
}
