import { ZodError } from 'zod';
import { HttpError } from './auth';
import { DatabaseQuotaError } from './db/errors';
export async function handleRequest(fn: () => Promise<unknown>) {
  try {
    const result = await fn();
    if (result instanceof Response) {
      result.headers.set('Cache-Control', 'private, no-store');
      return result;
    }
    return Response.json(result, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    if (error instanceof DatabaseQuotaError) {
      console.error('Database quota exhausted');
      return Response.json(
        { error: error.message, code: 'DATABASE_QUOTA_EXCEEDED' },
        {
          status: 503,
          headers: { 'Cache-Control': 'private, no-store' },
        },
      );
    }
    if (error instanceof HttpError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof ZodError)
      return Response.json(
        {
          error: 'Invalid request',
          details: error.issues.map((i) => ({
            path: i.path,
            message: i.message,
          })),
        },
        { status: 400 },
      );
    console.error(
      'Request failed',
      error instanceof Error ? error.name : 'Unknown error',
    );
    return Response.json(
      { error: 'Request failed. Please try again.' },
      { status: 500 },
    );
  }
}
