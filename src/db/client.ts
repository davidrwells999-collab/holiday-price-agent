import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { z } from 'zod';
import * as schema from './schema.js';

const DatabaseUrlSchema = z
  .string()
  .url()
  .refine((u) => u.startsWith('postgres://') || u.startsWith('postgresql://'));

/** Validates DATABASE_URL. The error names the variable but never echoes its value. */
export function parseDatabaseUrl(source: NodeJS.ProcessEnv = process.env): string {
  const result = DatabaseUrlSchema.safeParse(source.DATABASE_URL);
  if (!result.success) {
    throw new Error('DATABASE_URL is missing or is not a postgres:// or postgresql:// URL');
  }
  return result.data;
}

export type Db = NodePgDatabase<typeof schema>;

export function createDb(databaseUrl: string): { db: Db; pool: pg.Pool } {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 5,
    application_name: 'holiday-price-agent',
  });
  const db = drizzle({ client: pool, schema, casing: 'snake_case' });
  return { db, pool };
}
