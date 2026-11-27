import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from './client.js';
import type { Db } from './client.js';
import { runMigrations } from './migrate.js';
import { seed } from './seed.js';

const url = process.env.DATABASE_URL;

if (!url && process.env.REQUIRE_DB_TESTS === '1') {
  throw new Error('REQUIRE_DB_TESTS=1 but DATABASE_URL is not set; DB tests must not skip');
}

describe.skipIf(!url)('seed (real Postgres)', () => {
  let db: Db;
  let end: () => Promise<void>;

  beforeAll(async () => {
    await runMigrations(url as string);
    const created = createDb(url as string);
    db = created.db;
    end = () => created.pool.end();
  });

  afterAll(async () => {
    await end();
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

  it('rejects UPDATE and DELETE on price_observation', async () => {
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
  });
});
