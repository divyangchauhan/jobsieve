import 'server-only';
import { neon } from '@neondatabase/serverless';
import { createPool } from './pool';
import type { Database } from './types';
import { databaseError } from './errors';
let database: Database | undefined;
export function db(): Database {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  if (!database) {
    if (new URL(url).hostname.endsWith('.neon.tech')) {
      const sql = neon(url);
      database = {
        async query<T>(text: string, values: unknown[] = []) {
          try {
            // A client abort alone does not bound work already running in
            // Postgres. Set a server-side limit in the same HTTP transaction.
            const [, rows] = await sql.transaction(
              [
                sql.query("SET LOCAL statement_timeout = '15s'"),
                sql.query(text, values),
              ],
              {
                fetchOptions: { signal: AbortSignal.timeout(20000) },
              },
            );
            return { rows: rows as T[] };
          } catch (error) {
            throw databaseError(error);
          }
        },
      };
    } else database = createPool(url) as unknown as Database;
  }
  return database;
}
