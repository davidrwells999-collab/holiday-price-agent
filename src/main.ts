import { boot, type AppContext } from './app/boot.js';
import { EnvValidationError } from './config/env.js';

async function main(): Promise<void> {
  let ctx: AppContext;
  try {
    ctx = await boot();
  } catch (error) {
    if (error instanceof EnvValidationError) {
      console.error(error.message);
    } else {
      const e = error instanceof Error ? error : new Error('unknown');
      console.error(
        JSON.stringify({ level: 'error', msg: 'startup_failed', name: e.name, message: e.message }),
      );
    }
    process.exit(1);
  }

  const { logger } = ctx;

  const stop = (signal: string): void => {
    logger.info({ signal }, 'shutdown_requested');
    void ctx.shutdown().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));

  const fatal = (error: unknown): void => {
    ctx.telemetry.captureException(error);
    const e = error instanceof Error ? error : new Error('non-error thrown');
    logger.fatal({ name: e.name, message: e.message }, 'fatal');
    void ctx.shutdown().finally(() => process.exit(1));
  };
  process.on('uncaughtException', fatal);
  process.on('unhandledRejection', fatal);

  // Keeps the process alive until the Phase 6 scheduler replaces it.
  setInterval(() => logger.info('heartbeat'), 60 * 60 * 1000);
}

void main();
