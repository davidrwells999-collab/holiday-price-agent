import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from './client.js';
import type { Db } from './client.js';
import { runMigrations } from './migrate.js';
import { seed } from './seed.js';
import { createThrowawayDb, type ThrowawayDb } from './test-db.js';

// Integration tests never use DATABASE_URL (which may point at real data). They create and
// drop their own uniquely named database on the TEST_DATABASE_URL server.
const baseUrl = process.env.TEST_DATABASE_URL;
const url = baseUrl;

if (!url) {
  const msg = 'TEST_DATABASE_URL is not set; skipping DB integration tests';
  if (process.env.REQUIRE_DB_TESTS === '1') {
    throw new Error(
      `REQUIRE_DB_TESTS=1 but ${msg.replace('; skipping DB integration tests', '')}; DB tests must not skip`,
    );
  }
  process.stderr.write(`${msg}\n`);
}

describe.skipIf(!url)('seed (real Postgres)', () => {
  let db: Db;
  let end: () => Promise<void>;
  let throwaway: ThrowawayDb;

  beforeAll(async () => {
    throwaway = await createThrowawayDb(baseUrl as string);
    await runMigrations(throwaway.url);
    const created = createDb(throwaway.url);
    db = created.db;
    end = () => created.pool.end();
  });

  afterAll(async () => {
    await end?.();
    await throwaway?.drop();
  });

  async function count(table: string): Promise<number> {
    const res = await db.execute<{ n: number }>(sql.raw(`select count(*)::int as n from ${table}`));
    return res.rows[0]?.n ?? -1;
  }

  it('seeding twice leaves each row exactly once', async () => {
    await seed(db);
    const second = await seed(db);
    expect(Object.values(second).every((n) => n === 0)).toBe(true);
    expect(await count('search')).toBe(1);
    expect(await count('search_party')).toBe(2);
    expect(await count('search_airport')).toBe(2);
    expect(await count('room_setup')).toBe(3);
    expect(await count('airport_cost')).toBe(2);
    expect(await count('seller')).toBe(4);
  });

  it('keeps owner edits across a re-seed', async () => {
    await db.execute(
      sql`update airport_cost set parking_cost_pence = 12000 where airport_code = 'BHX'`,
    );
    await seed(db);
    const res = await db.execute<{ p: number }>(
      sql`select parking_cost_pence as p from airport_cost where airport_code = 'BHX'`,
    );
    expect(res.rows[0]?.p).toBe(12000);
  });

  it('lets the owner flip a seller off with one UPDATE', async () => {
    await db.execute(sql`update seller set enabled = false where id = 'tui'`);
    const res = await db.execute<{ enabled: boolean }>(
      sql`select enabled from seller where id = 'tui'`,
    );
    expect(res.rows[0]?.enabled).toBe(false);
  });

  it('rejects UPDATE, DELETE and TRUNCATE (incl. CASCADE) on price_observation', async () => {
    const run = await db.execute<{ id: string }>(
      sql`insert into run (trigger) values ('manual') returning id`,
    );
    const s = await db.execute<{ id: number }>(sql`select id from search limit 1`);
    const q = await db.execute<{ id: number }>(sql`
      insert into quote (search_id, seller_id, airport_code, depart_date, nights, room_setup_key,
        party_variant, headline_price_pence, price_basis, direct, url)
      values (${s.rows[0]?.id}, 'jet2', 'BRS', '2027-05-10', 7, 'cheapest_standard', 'base', 250000,
        'total', true, 'https://example.invalid/q')
      returning id`);
    const quoteId = q.rows[0]?.id;
    expect(quoteId).toBeDefined();
    await db.execute(
      sql`insert into price_observation (quote_id, run_id, headline_price_pence)
          values (${quoteId}, ${run.rows[0]?.id}, 250000)`,
    );
    await expect(
      db.execute(sql`update price_observation set headline_price_pence = 1`),
    ).rejects.toThrow();
    await expect(db.execute(sql`delete from price_observation`)).rejects.toThrow();
    await expect(db.execute(sql`truncate price_observation`)).rejects.toThrow();
    await expect(db.execute(sql`truncate quote cascade`)).rejects.toThrow();
    await expect(db.execute(sql`truncate run cascade`)).rejects.toThrow();
  });
});
