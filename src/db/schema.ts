import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { RoomOccupancy } from '../pricing/types.js';
import { SELLER_IDS } from '../sellers/ids.js';

export const SELLER_ID_VALUES = SELLER_IDS;

export const priceBasisEnum = pgEnum('price_basis', ['total', 'per_person']);
export const triStateEnum = pgEnum('tri_state', ['included', 'extra', 'unknown']);
export const runTriggerEnum = pgEnum('run_trigger', ['schedule', 'manual', 'canary']);
export const runStatusEnum = pgEnum('run_status', ['running', 'ok', 'partial', 'failed']);
export const sellerRunStatusEnum = pgEnum('seller_run_status', [
  'running',
  'ok',
  'captcha',
  'blocked',
  'error',
  'parse_failed',
  'unavailable',
  'skipped',
]);
export const dealSourceEnum = pgEnum('deal_source', [
  'topcashback',
  'quidco',
  'blue_light_card',
  'student_beans',
  'mse',
  'hotukdeals',
]);
export const dealTypeEnum = pgEnum('deal_type', ['code', 'cashback', 'sale']);
export const alertReasonEnum = pgEnum('alert_reason', [
  'best_drop',
  'brs_within_bhx',
  'new_deal',
  'deal_expiring',
  'seller_unhealthy',
  'digest',
]);
export const alertStatusEnum = pgEnum('alert_status', ['pending', 'sent', 'failed']);

const now = () => timestamp({ withTimezone: true }).notNull().defaultNow();
/** Local wall-clock time (no zone); the airport code column says where. */
const localTime = (name: string) => timestamp(name, { mode: 'string' });

export interface AlertRules {
  bestDropPence: number;
  brsWithinBhxPence: number;
  newDealMinPence: number;
  dealExpiryHours: number;
}

export const search = pgTable('search', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  hotelName: text().notNull(),
  hotelLocation: text().notNull(),
  boardBasis: text().notNull(),
  nights: integer().notNull(),
  departFrom: date({ mode: 'string' }).notNull(),
  departTo: date({ mode: 'string' }).notNull(),
  maxPricePence: integer(),
  alertRules: jsonb().$type<AlertRules>().notNull(),
  active: boolean().notNull().default(true),
  createdAt: now(),
  updatedAt: now(),
});

export const searchParty = pgTable(
  'search_party',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    searchId: integer()
      .notNull()
      .references(() => search.id, { onDelete: 'cascade' }),
    variant: text().notNull(),
    adults: integer().notNull(),
    childAges: integer()
      .array()
      .notNull()
      .default(sql`'{}'::integer[]`),
    infants: integer().notNull().default(0),
    active: boolean().notNull().default(true),
  },
  (t) => [unique('search_party_search_variant').on(t.searchId, t.variant)],
);

export const searchAirport = pgTable(
  'search_airport',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    searchId: integer()
      .notNull()
      .references(() => search.id, { onDelete: 'cascade' }),
    airportCode: char({ length: 3 }).notNull(),
    /** 1 = most preferred. */
    preference: integer().notNull(),
    active: boolean().notNull().default(true),
  },
  (t) => [unique('search_airport_search_code').on(t.searchId, t.airportCode)],
);

export const airportCost = pgTable('airport_cost', {
  airportCode: char({ length: 3 }).primaryKey(),
  label: text().notNull(),
  travelMode: text().notNull(),
  travelCostPence: integer().notNull(),
  parkingCostPence: integer().notNull(),
  driveHomeMinutes: integer().notNull(),
  overnightHotelPence: integer().notNull(),
  timezone: text().notNull().default('Europe/London'),
  updatedAt: now(),
});

export const roomSetup = pgTable(
  'room_setup',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    searchId: integer()
      .notNull()
      .references(() => search.id, { onDelete: 'cascade' }),
    key: text().notNull(),
    label: text().notNull(),
    rooms: integer().notNull(),
    /** standard | family */
    roomType: text().notNull(),
    occupancy: jsonb().$type<RoomOccupancy[]>().notNull(),
    active: boolean().notNull().default(true),
  },
  (t) => [unique('room_setup_search_key').on(t.searchId, t.key)],
);

export const seller = pgTable('seller', {
  id: text({ enum: SELLER_ID_VALUES }).primaryKey(),
  displayName: text().notNull(),
  enabled: boolean().notNull().default(true),
  blockedUntil: timestamp({ withTimezone: true }),
  updatedAt: now(),
});

export const run = pgTable('run', {
  /** Doubles as the trace run_id. */
  id: uuid().primaryKey().defaultRandom(),
  trigger: runTriggerEnum().notNull(),
  status: runStatusEnum().notNull().default('running'),
  resolvedSellers: jsonb(),
  startedAt: now(),
  finishedAt: timestamp({ withTimezone: true }),
});

export const sellerRun = pgTable(
  'seller_run',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    runId: uuid()
      .notNull()
      .references(() => run.id),
    sellerId: text({ enum: SELLER_ID_VALUES })
      .notNull()
      .references(() => seller.id),
    status: sellerRunStatusEnum().notNull(),
    jobsPlanned: integer().notNull().default(0),
    jobsOk: integer().notNull().default(0),
    quotesFound: integer().notNull().default(0),
    droppedNonDirect: integer().notNull().default(0),
    unavailableCount: integer().notNull().default(0),
    errorDetail: text(),
    artefactPath: text(),
    startedAt: now(),
    finishedAt: timestamp({ withTimezone: true }),
  },
  (t) => [uniqueIndex('seller_run_run_seller').on(t.runId, t.sellerId)],
);

export const quote = pgTable(
  'quote',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    searchId: integer()
      .notNull()
      .references(() => search.id),
    sellerId: text({ enum: SELLER_ID_VALUES })
      .notNull()
      .references(() => seller.id),
    airportCode: char({ length: 3 }).notNull(),
    departDate: date({ mode: 'string' }).notNull(),
    nights: integer().notNull(),
    roomSetupKey: text().notNull(),
    partyVariant: text().notNull(),
    roomName: text().notNull().default(''),
    headlinePricePence: integer().notNull(),
    priceBasis: priceBasisEnum().notNull(),
    bagsStatus: triStateEnum().notNull().default('unknown'),
    bagCostPence: integer(),
    transfersStatus: triStateEnum().notNull().default('unknown'),
    transferCostPence: integer(),
    infantFeeStatus: triStateEnum().notNull().default('unknown'),
    infantFeePence: integer(),
    outDepLocal: localTime('out_dep_local'),
    outDepAirport: char({ length: 3 }),
    outArrLocal: localTime('out_arr_local'),
    outArrAirport: char({ length: 3 }),
    retDepLocal: localTime('ret_dep_local'),
    retDepAirport: char({ length: 3 }),
    retArrLocal: localTime('ret_arr_local'),
    retArrAirport: char({ length: 3 }),
    direct: boolean().notNull(),
    url: text().notNull(),
    firstSeenAt: now(),
    lastSeenAt: now(),
  },
  (t) => [
    uniqueIndex('quote_natural_key').on(
      t.searchId,
      t.sellerId,
      t.airportCode,
      t.departDate,
      t.nights,
      t.roomSetupKey,
      t.partyVariant,
      t.roomName,
    ),
    check('quote_headline_price_positive', sql`${t.headlinePricePence} > 0`),
  ],
);

/** Append-only: a DB trigger rejects UPDATE and DELETE (see drizzle/0001). */
export const priceObservation = pgTable(
  'price_observation',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    quoteId: integer()
      .notNull()
      .references(() => quote.id),
    runId: uuid()
      .notNull()
      .references(() => run.id),
    headlinePricePence: integer().notNull(),
    trueCostPence: integer(),
    conservativeTrueCostPence: integer(),
    calcVersion: text(),
    breakdown: jsonb(),
    observedAt: now(),
  },
  (t) => [uniqueIndex('price_observation_quote_run').on(t.quoteId, t.runId)],
);

export const deal = pgTable(
  'deal',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    sellerId: text({ enum: SELLER_ID_VALUES })
      .notNull()
      .references(() => seller.id),
    source: dealSourceEnum().notNull(),
    type: dealTypeEnum().notNull(),
    codeOrTitle: text().notNull(),
    valuePence: integer(),
    /** Percentages as integer basis points: 3% = 300. */
    valueBps: integer(),
    conditions: text(),
    minSpendPence: integer(),
    capPence: integer(),
    expiresAt: timestamp({ withTimezone: true }),
    stacksWithCashback: boolean(),
    newCustomerOnly: boolean(),
    voidsCashback: boolean(),
    firstSeenAt: now(),
    seenAt: now(),
  },
  (t) => [
    unique('deal_natural_key')
      .on(t.sellerId, t.source, t.type, t.codeOrTitle, t.expiresAt)
      .nullsNotDistinct(),
  ],
);

export const alert = pgTable(
  'alert',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    reason: alertReasonEnum().notNull(),
    quoteId: integer().references(() => quote.id),
    dealId: integer().references(() => deal.id),
    runId: uuid().references(() => run.id),
    dedupeKey: text().notNull(),
    status: alertStatusEnum().notNull().default('pending'),
    sentAt: timestamp({ withTimezone: true }),
    createdAt: now(),
  },
  (t) => [index('alert_dedupe_sent').on(t.dedupeKey, t.sentAt)],
);
