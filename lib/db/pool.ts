import { Pool as PgPool } from 'pg';
import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import WebSocket from 'ws';
import type { Database } from './types';
export interface DatabasePool extends Database {
  connect(): Promise<Database & { release(): void }>;
  end(): Promise<void>;
}
neonConfig.webSocketConstructor = WebSocket;
export function createPool(connectionString: string): DatabasePool {
  const isNeon = new URL(connectionString).hostname.endsWith('.neon.tech');
  const options = {
    connectionString,
    max: 5,
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 12000,
  };
  return (isNeon
    ? new NeonPool(options)
    : new PgPool(options)) as unknown as DatabasePool;
}
