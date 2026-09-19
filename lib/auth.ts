import 'server-only';
import { auth, currentUser } from '@clerk/nextjs/server';
import { db } from './db';
import { ensureUser } from './users';
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function requireUser() {
  const { userId } = await auth();
  if (!userId) throw new HttpError(401, 'Sign in to continue');
  const user = await currentUser();
  if (!user || user.id !== userId) throw new HttpError(401, 'Session expired');
  const email =
    user.emailAddresses.find(
      (e) =>
        e.id === user.primaryEmailAddressId &&
        e.verification?.status === 'verified',
    )?.emailAddress ?? null;
  return ensureUser(db(), userId, email);
}
