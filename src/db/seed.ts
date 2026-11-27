import { pathToFileURL } from 'node:url';
import { eq } from 'drizzle-orm';
import { createDb, parseDatabaseUrl } from './client.js';
import type { Db } from './client.js';
import { SEED, SeedSchema } from './seed-data.js';
import { airportCost, roomSetup, search, searchAirport, searchParty, seller } from './schema.js';

export interface SeedSummary {
  search: number;
  searchParty: number;
  searchAirport: number;
  roomSetup: number;
  airportCost: number;
  seller: number;
}

/**
 * Insert-if-absent on natural keys. Not an upsert: owner edits made in the
 * database survive re-seeding. Returns rows inserted per table.
 */
export async function seed(db: Db): Promise<SeedSummary> {
  const data = SeedSchema.parse(SEED);
  return db.transaction(async (tx) => {
    const summary: SeedSummary = {
      search: 0,
      searchParty: 0,
      searchAirport: 0,
      roomSetup: 0,
      airportCost: 0,
      seller: 0,
    };

    summary.search = (
      await tx
        .insert(search)
        .values(data.search)
        .onConflictDoNothing({ target: search.slug })
        .returning({ id: search.id })
    ).length;
    const [row] = await tx
      .select({ id: search.id })
      .from(search)
      .where(eq(search.slug, data.search.slug));
    if (!row) throw new Error('seed: search row missing after insert');
    const searchId = row.id;

    summary.searchParty = (
      await tx
        .insert(searchParty)
        .values(data.parties.map((p) => ({ ...p, searchId })))
        .onConflictDoNothing({ target: [searchParty.searchId, searchParty.variant] })
        .returning({ id: searchParty.id })
    ).length;

    summary.searchAirport = (
      await tx
        .insert(searchAirport)
        .values(data.airports.map((a) => ({ ...a, searchId })))
        .onConflictDoNothing({ target: [searchAirport.searchId, searchAirport.airportCode] })
        .returning({ id: searchAirport.id })
    ).length;

    summary.roomSetup = (
      await tx
        .insert(roomSetup)
        .values(data.roomSetups.map((r) => ({ ...r, searchId })))
        .onConflictDoNothing({ target: [roomSetup.searchId, roomSetup.key] })
        .returning({ id: roomSetup.id })
    ).length;

    summary.airportCost = (
      await tx
        .insert(airportCost)
        .values(data.airportCosts)
        .onConflictDoNothing({ target: airportCost.airportCode })
        .returning({ code: airportCost.airportCode })
    ).length;

    summary.seller = (
      await tx
        .insert(seller)
        .values(data.sellers)
        .onConflictDoNothing({ target: seller.id })
        .returning({ id: seller.id })
    ).length;

    return summary;
  });
}

async function main(): Promise<void> {
  let pool: ReturnType<typeof createDb>['pool'] | undefined;
  try {
    const created = createDb(parseDatabaseUrl());
    pool = created.pool;
    const summary = await seed(created.db);
    process.stdout.write(`${JSON.stringify({ msg: 'seed_done', inserted: summary })}\n`);
  } catch (err) {
    const e = err instanceof Error ? err : new Error('unknown error');
    process.stderr.write(`seed failed: ${e.name}: ${e.message}\n`);
    process.exitCode = 1;
  } finally {
    await pool?.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
