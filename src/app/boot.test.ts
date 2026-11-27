import { Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { EnvValidationError } from '../config/env.js';
import { boot, type BootDeps } from './boot.js';

const validEnv: NodeJS.ProcessEnv = {
  ANTHROPIC_API_KEY: 'sk-ant-test',
  DATABASE_URL: 'postgres://u:secretpw@db:5432/d',
  NTFY_TOPIC: 'test-topic',
};

function makeDeps(overrides: Partial<BootDeps> = {}): {
  deps: BootDeps;
  logs: () => Record<string, unknown>[];
  end: ReturnType<typeof vi.fn>;
  createDb: ReturnType<typeof vi.fn>;
} {
  const chunks: string[] = [];
  const logDestination = new Writable({
    write(chunk: Buffer, _enc, cb) {
      chunks.push(chunk.toString());
      cb();
    },
  });
  const end = vi.fn(() => Promise.resolve());
  const createDb = vi.fn(() => ({ db: {}, pool: { end } }));
  const deps = {
    envSource: validEnv,
    createDb,
    pingDb: () => Promise.resolve(),
    loadSellerConfig: () =>
      Promise.resolve([
        { id: 'jet2', enabled: true },
        { id: 'tui', enabled: true },
        { id: 'on_the_beach', enabled: true },
        { id: 'easyjet_holidays', enabled: true },
      ]),
    logDestination,
    ...overrides,
  } as unknown as BootDeps;
  return {
    deps,
    logs: () =>
      chunks
        .join('')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as Record<string, unknown>),
    end,
    createDb,
  };
}

describe('boot', () => {
  it('rejects with EnvValidationError and never creates the DB when env is invalid', async () => {
    const { deps, createDb } = makeDeps({ envSource: { ...validEnv, NTFY_TOPIC: undefined } });
    await expect(boot(deps)).rejects.toBeInstanceOf(EnvValidationError);
    expect(createDb).not.toHaveBeenCalled();
  });

  it('starts with telemetry and tracing disabled when PostHog/OTel env are unset', async () => {
    const { deps, logs } = makeDeps();
    const ctx = await boot(deps);
    expect(ctx.telemetry.enabled).toBe(false);
    expect(ctx.tracing.enabled).toBe(false);
    const entries = logs();
    const cfg = entries.find((e) => e.msg === 'telemetry_configured');
    expect(cfg).toMatchObject({ posthog: 'disabled', tracing: false });
    const ready = entries.find((e) => e.msg === 'app_ready');
    expect(ready).toBeDefined();
    expect(ready?.sellers).toMatchObject({
      jet2: { enabled: true, source: 'config' },
      tui: { enabled: true, source: 'config' },
    });
    await ctx.shutdown();
  });

  it('reflects seller rows loaded from the database', async () => {
    const { deps, logs } = makeDeps({
      loadSellerConfig: () =>
        Promise.resolve([
          { id: 'tui', enabled: false },
          { id: 'jet2', enabled: true },
          { id: 'not_a_seller', enabled: true },
        ]),
    });
    const ctx = await boot(deps);
    const ready = logs().find((e) => e.msg === 'app_ready');
    expect(ready?.sellers).toMatchObject({
      tui: { enabled: false, source: 'config' },
      jet2: { enabled: true, source: 'config' },
      on_the_beach: { enabled: false, source: 'default' },
    });
    expect(ctx.sellers.tui.enabled).toBe(false);
    await ctx.shutdown();
  });

  it('fails with database_unreachable without leaking the connection string', async () => {
    const { deps, end } = makeDeps({
      pingDb: () => Promise.reject(new Error('connect ECONNREFUSED postgres://u:secretpw@db')),
    });
    const err = await boot(deps).catch((e: unknown) => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('database_unreachable');
    expect((err as Error).message).not.toContain('secretpw');
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('closes the pool and rethrows the original error when the seller loader fails', async () => {
    const boom = new Error('loader_failed');
    const { deps, end } = makeDeps({ loadSellerConfig: () => Promise.reject(boom) });
    await expect(boot(deps)).rejects.toBe(boom);
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('does not close the pool on a successful boot', async () => {
    const { deps, end } = makeDeps();
    const ctx = await boot(deps);
    expect(end).not.toHaveBeenCalled();
    await ctx.shutdown();
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('closes the pool even when tracing shutdown rejects, then surfaces the failure', async () => {
    const boom = new Error('tracing_shutdown_failed');
    const tracingProvider = {
      enabled: true,
      withSpan: (_n: unknown, _a: unknown, fn: (s: unknown) => Promise<unknown>) => fn({}),
      shutdown: () => Promise.reject(boom),
    };
    const { deps, end } = makeDeps({
      envSource: { ...validEnv, OTEL_EXPORTER_OTLP_ENDPOINT: 'http://otel.example.com:4318' },
      tracingProvider: tracingProvider as unknown as BootDeps['tracingProvider'],
    });
    const ctx = await boot(deps);
    await expect(ctx.shutdown()).rejects.toBe(boom);
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('shutdown is idempotent and ends the pool once', async () => {
    const { deps, end } = makeDeps();
    const ctx = await boot(deps);
    await Promise.all([ctx.shutdown(), ctx.shutdown()]);
    await ctx.shutdown();
    expect(end).toHaveBeenCalledTimes(1);
  });
});
