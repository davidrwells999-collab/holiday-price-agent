import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { parseDatabaseUrl } from './client.js';

/** Arbitrary constant; serialises concurrent migrate runs. */
const MIGRATION_LOCK_ID = 727001;

export async function runMigrations(databaseUrl: string): Promise<void> {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 1,
    application_name: 'holiday-price-agent-migrate',
  });
  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
      try {
        await migrate(drizzle({ client, casing: 'snake_case' }), {
          migrationsFolder: process.env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), 'drizzle'),
        });
      } finally {
        await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
      }
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  try {
    await runMigrations(parseDatabaseUrl());
    process.stdout.write('{"msg":"migrations_applied"}\n');
  } catch (err) {
    // Name and message only: never print the connection string.
    const e = err instanceof Error ? err : new Error('unknown error');
    process.stderr.write(`migration failed: ${e.name}: ${e.message}\n`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
