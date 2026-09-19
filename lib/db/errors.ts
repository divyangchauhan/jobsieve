export class DatabaseQuotaError extends Error {
  constructor() {
    super(
      'Job data is temporarily unavailable. The site owner needs to restore database access.',
    );
    this.name = 'DatabaseQuotaError';
  }
}
export function databaseError(error: unknown): unknown {
  if (
    error instanceof Error &&
    /exceeded (?:the )?(?:data transfer|compute time|storage) quota/i.test(
      error.message,
    )
  ) {
    return new DatabaseQuotaError();
  }
  return error;
}
