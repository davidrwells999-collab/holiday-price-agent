import { randomBytes } from 'node:crypto';
import pg from 'pg';

export interface ThrowawayDb {
  /** Connection string for the freshly created, empty database. */
  url: string;
  name: string;
  drop(): Promise<void>;
}

/**
 * Creates a uniquely named empty database on the server in `baseUrl`, for integration tests.
 * The caller migrates it and must call `drop()` in teardown. Never touches the base database.
 */
export async function createThrowawayDb(baseUrl: string): Promise<ThrowawayDb> {
  const name = `hpa_test_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Pool({ connectionString: baseUrl, max: 1 });
  try {
    await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }
  const u = new URL(baseUrl);
  u.pathname = `/${name}`;
  return {
    url: u.toString(),
    name,
    drop: async () => {
      const a = new pg.Pool({ connectionString: baseUrl, max: 1 });
      try {
        await a.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      } finally {
        await a.end();
      }
    },
  };
}
