import { SignUp } from '@clerk/nextjs';
export default function Page() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-50 p-4">
      <h1 className="text-2xl font-bold">Create your JobSieve account</h1>
      <SignUp />
    </main>
  );
}
