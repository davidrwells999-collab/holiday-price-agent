import type { DestinationStream } from 'pino';
import type { Pool } from 'pg';
import { loadEnv, type Env } from '../config/env.js';
import { createDb as defaultCreateDb, type Db } from '../db/client.js';
import { seller } from '../db/schema.js';
import { createLogger, type Logger } from '../logging/logger.js';
import { resolveSellerEnablement, type SellerEnablement } from '../sellers/enablement.js';
import { isSellerId, type SellerId } from '../sellers/ids.js';
import { createTelemetry, type Telemetry } from '../telemetry/telemetry.js';
import { createTracing, type Tracing } from '../telemetry/tracing.js';

export interface BootDeps {
  envSource?: NodeJS.ProcessEnv;
  createDb?: typeof defaultCreateDb;
  loadSellerConfig?: (db: Db) => Promise<{ id: string; enabled: boolean }[]>;
  pingDb?: (pool: Pool) => Promise<void>;
  logDestination?: DestinationStream;
}

export interface AppContext {
  env: Env;
  logger: Logger;
  telemetry: Telemetry;
  tracing: Tracing;
  db: Db;
  pool: Pool;
  sellers: SellerEnablement;
  shutdown(): Promise<void>;
}

const defaultLoadSellerConfig = (db: Db): Promise<{ id: string; enabled: boolean }[]> =>
  db.select({ id: seller.id, enabled: seller.enabled }).from(seller);

const defaultPingDb = async (pool: Pool): Promise<void> => {
  await pool.query('select 1');
};

export async function boot(deps: BootDeps = {}): Promise<AppContext> {
  const env = loadEnv(deps.envSource);
  const logger = createLogger(env.LOG_LEVEL, deps.logDestination);

  const telemetry = createTelemetry(env);
  const tracing = createTracing(env);
  logger.info(
    {
      posthog: env.POSTHOG_API_KEY ? 'key_set_backend_noop_until_phase_3' : 'disabled',
      tracing: tracing.enabled,
    },
    'telemetry_configured',
  );

  const { db, pool } = (deps.createDb ?? defaultCreateDb)(env.DATABASE_URL);
  try {
    await (deps.pingDb ?? defaultPingDb)(pool);
  } catch (cause) {
    await pool.end().catch(() => undefined);
    throw new Error('database_unreachable', { cause });
  }

  const rows = await (deps.loadSellerConfig ?? defaultLoadSellerConfig)(db);
  const config: Partial<Record<SellerId, boolean>> = {};
  for (const row of rows) {
    if (isSellerId(row.id)) config[row.id] = row.enabled;
  }
  const sellers = await resolveSellerEnablement(config, telemetry);

  logger.info({ sellers, node: process.version }, 'app_ready');

  let closing: Promise<void> | undefined;
  const shutdown = (): Promise<void> => {
    closing ??= (async () => {
      await telemetry.shutdown(5000);
      await tracing.shutdown(5000);
      await pool.end();
    })();
    return closing;
  };

  return { env, logger, telemetry, tracing, db, pool, sellers, shutdown };
}
