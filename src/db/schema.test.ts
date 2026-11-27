import { is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { SELLER_IDS } from '../sellers/ids.js';
import * as schema from './schema.js';

const tables: PgTable[] = Object.values(schema).filter((v): v is never => is(v, PgTable));
// Columns are camelCase keys; `casing: 'snake_case'` maps them to snake_case SQL names.
const snake = (s: string): string => s.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());
const colNames = (cols: { name: string }[]): string[] => cols.map((c) => snake(c.name));

describe('schema', () => {
  it('defines the twelve tables', () => {
    expect(tables.map((t) => getTableConfig(t).name).sort()).toEqual(
      [
        'alert',
        'airport_cost',
        'deal',
        'price_observation',
        'quote',
        'room_setup',
        'run',
        'search',
        'search_airport',
        'search_party',
        'seller',
        'seller_run',
      ].sort(),
    );
  });

  it('quote has the natural-key unique index', () => {
    const idx = getTableConfig(schema.quote).indexes.find(
      (i) => i.config.name === 'quote_natural_key',
    );
    expect(idx?.config.unique).toBe(true);
    expect(colNames(idx?.config.columns as { name: string }[])).toEqual([
      'search_id',
      'seller_id',
      'airport_code',
      'depart_date',
      'nights',
      'room_setup_key',
      'party_variant',
      'room_name',
    ]);
  });

  it('every _pence column is integer and no float/numeric columns exist', () => {
    for (const t of tables) {
      for (const c of getTableConfig(t).columns) {
        expect(['PgReal', 'PgDoublePrecision', 'PgNumeric']).not.toContain(c.columnType);
        if (snake(c.name).endsWith('_pence')) expect(c.columnType).toBe('PgInteger');
      }
    }
  });

  it('quote.price_basis is NOT NULL enum total/per_person', () => {
    const col = getTableConfig(schema.quote).columns.find((c) => snake(c.name) === 'price_basis');
    expect(col?.notNull).toBe(true);
    expect(col?.enumValues).toEqual(['total', 'per_person']);
  });

  it('price_observation unique on (quote_id, run_id)', () => {
    const idx = getTableConfig(schema.priceObservation).indexes.find((i) => i.config.unique);
    expect(colNames(idx?.config.columns as { name: string }[])).toEqual(['quote_id', 'run_id']);
  });

  it('seller_run unique on (run_id, seller_id)', () => {
    const idx = getTableConfig(schema.sellerRun).indexes.find((i) => i.config.unique);
    expect(colNames(idx?.config.columns as { name: string }[])).toEqual(['run_id', 'seller_id']);
  });

  it('deal unique treats NULL expires_at as equal', () => {
    const cfg = getTableConfig(schema.deal);
    const u = cfg.uniqueConstraints.find((c) =>
      c.columns.some((x) => snake(x.name) === 'expires_at'),
    );
    expect(u?.nullsNotDistinct).toBe(true);
    expect(colNames(u?.columns ?? [])).toEqual([
      'seller_id',
      'source',
      'type',
      'code_or_title',
      'expires_at',
    ]);
  });

  it('seller ids match SELLER_IDS and seller has an enabled flag', () => {
    expect([...schema.SELLER_ID_VALUES]).toEqual([...SELLER_IDS]);
    const col = getTableConfig(schema.seller).columns.find((c) => snake(c.name) === 'enabled');
    expect(col?.notNull).toBe(true);
    expect(col?.default).toBe(true);
  });
});
