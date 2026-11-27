import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { DISTINCT_ID, EVENT_SCHEMAS, type EventName } from './events.js';
import {
  createTelemetry,
  stripUrlQueries,
  type DropReason,
  type TelemetryBackend,
} from './telemetry.js';

const RUN_ID = '3f2c1a9e-5b7d-4c1e-8a2f-1d2e3f4a5b6c';
const quoteProps = {
  run_id: RUN_ID,
  seller: 'jet2',
  airport: 'BHX',
  depart_date: '2027-05-01',
  room_setup: 'two_adults',
  true_cost_pence: 123456,
} as const;

function fakeBackend(overrides: Partial<TelemetryBackend> = {}) {
  const capture = vi.fn();
  const captureException = vi.fn();
  const backend: TelemetryBackend = {
    enabled: true,
    capture,
    captureException,
    getFeatureFlag: () => Promise.resolve(undefined),
    flush: () => Promise.resolve(),
    shutdown: () => Promise.resolve(),
    ...overrides,
  };
  return { backend, capture, captureException };
}

const ON = { POSTHOG_API_KEY: 'phc_test' };

describe('telemetry with PostHog unset', () => {
  it('is a no-op that never throws', async () => {
    const t = createTelemetry({ POSTHOG_API_KEY: undefined });
    expect(t.enabled).toBe(false);
    expect(() => t.capture('quote_saved', quoteProps)).not.toThrow();
    expect(() => t.captureException(new Error('x'))).not.toThrow();
    await expect(t.flush()).resolves.toBeUndefined();
    await expect(t.shutdown()).resolves.toBeUndefined();
    await expect(t.getFeatureFlag('seller_jet2_enabled', true)).resolves.toBe(true);
    await expect(t.getFeatureFlag('seller_jet2_enabled', false)).resolves.toBe(false);
  });

  it('ignores a supplied backend when PostHog is unset', () => {
    const { backend, capture } = fakeBackend();
    createTelemetry({ POSTHOG_API_KEY: undefined }, { backend }).capture('quote_saved', quoteProps);
    expect(capture).not.toHaveBeenCalled();
  });
});

describe('telemetry allow-list', () => {
  it('forwards a valid event once with the fixed distinct id', () => {
    const { backend, capture } = fakeBackend();
    createTelemetry(ON, { backend }).capture('quote_saved', quoteProps);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith({
      distinctId: DISTINCT_ID,
      event: 'quote_saved',
      properties: quoteProps,
    });
    expect(DISTINCT_ID).toBe('holiday-agent');
  });

  it('drops an unknown event', () => {
    const { backend, capture } = fakeBackend();
    const onDropped = vi.fn();
    const t = createTelemetry(ON, { backend, onDropped });
    t.capture('page_viewed' as unknown as EventName, {} as never);
    expect(capture).not.toHaveBeenCalled();
    expect(onDropped).toHaveBeenCalledWith({ event: 'page_viewed', reason: 'unknown_event' });
  });

  it('drops extra properties', () => {
    const { backend, capture } = fakeBackend();
    const onDropped = vi.fn();
    const t = createTelemetry(ON, { backend, onDropped });
    t.capture('quote_saved', { ...quoteProps, page_text: 'x' } as never);
    expect(capture).not.toHaveBeenCalled();
    expect(onDropped).toHaveBeenCalledWith({ event: 'quote_saved', reason: 'invalid_props' });
  });

  it('drops free-text enum values', () => {
    const { backend, capture } = fakeBackend();
    const onDropped = vi.fn();
    const t = createTelemetry(ON, { backend, onDropped });
    t.capture('scrape_failed', { run_id: RUN_ID, seller: 'jet2', reason: 'free text' } as never);
    expect(capture).not.toHaveBeenCalled();
    expect(onDropped).toHaveBeenCalledWith({ event: 'scrape_failed', reason: 'invalid_props' });
  });

  it('does not allow inherited object keys as event names', () => {
    const { backend, capture } = fakeBackend();
    const t = createTelemetry(ON, { backend });
    t.capture('constructor' as unknown as EventName, {} as never);
    expect(capture).not.toHaveBeenCalled();
  });

  it('defines exactly the eight allowed events', () => {
    expect(Object.keys(EVENT_SCHEMAS).sort()).toEqual(
      [
        'alert_sent',
        'captcha_detected',
        'deal_found',
        'eval_run',
        'quote_saved',
        'scrape_failed',
        'search_run_finished',
        'search_run_started',
      ].sort(),
    );
  });

  it('rejects missing fields at compile time', () => {
    const t = createTelemetry({ POSTHOG_API_KEY: undefined });
    // @ts-expect-error missing required properties
    t.capture('quote_saved', { seller: 'jet2' });
  });
});

describe('telemetry resilience', () => {
  it('swallows a synchronous backend throw', () => {
    const reasons: DropReason[] = [];
    const { backend } = fakeBackend({
      capture: () => {
        throw new Error('boom');
      },
    });
    const t = createTelemetry(ON, { backend, onDropped: (i) => reasons.push(i.reason) });
    expect(() => t.capture('quote_saved', quoteProps)).not.toThrow();
    expect(reasons).toEqual(['backend_error']);
  });

  it('swallows an async backend rejection', async () => {
    const reasons: DropReason[] = [];
    const { backend } = fakeBackend({ capture: () => Promise.reject(new Error('boom')) });
    const t = createTelemetry(ON, { backend, onDropped: (i) => reasons.push(i.reason) });
    t.capture('quote_saved', quoteProps);
    await new Promise((r) => setTimeout(r, 0));
    expect(reasons).toEqual(['backend_error']);
  });

  it('captureException sends only name, hash and length', () => {
    const { backend, captureException } = fakeBackend();
    const t = createTelemetry(ON, { backend });
    t.captureException(new TypeError('boom'));
    const call = captureException.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call).toEqual({
      distinctId: DISTINCT_ID,
      error_name: 'TypeError',
      message_sha256: createHash('sha256').update('boom').digest('hex').slice(0, 16),
      message_length: 4,
    });
  });

  it('captureException never forwards emails, tokens or connection strings', () => {
    const { backend, captureException } = fakeBackend();
    const t = createTelemetry(ON, { backend });
    const email = 'jane.doe' + '@' + 'example.com';
    const token = 'sk-' + 'ant-' + 'a1'.repeat(20);
    const conn = 'postgres://' + 'user:pass' + '@db.example.com:5432/x';
    t.captureException(
      new Error(`failed for ${email} with ${token} at ${conn} https://example.com/a?token=SECRET`),
    );
    const payload = JSON.stringify(captureException.mock.calls[0]?.[0]);
    for (const leak of [email, token, conn, 'user:pass', 'SECRET', 'jane.doe', 'failed']) {
      expect(payload).not.toContain(leak);
    }
    expect(Object.keys(captureException.mock.calls[0]?.[0] as object).sort()).toEqual([
      'distinctId',
      'error_name',
      'message_length',
      'message_sha256',
    ]);
  });

  it('captureException does not forward a custom error name that holds free text', () => {
    const { backend, captureException } = fakeBackend();
    const err = new Error('x');
    err.name = 'bad name jane.doe' + '@' + 'example.com';
    createTelemetry(ON, { backend }).captureException(err);
    expect(captureException.mock.calls[0]?.[0]).toMatchObject({ error_name: 'Error' });
  });

  it('captureException labels non-errors without forwarding content', () => {
    const { backend, captureException } = fakeBackend();
    createTelemetry(ON, { backend }).captureException('secret string');
    const call = captureException.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call).toMatchObject({ error_name: 'NonError', message_length: 0 });
    expect(JSON.stringify(call)).not.toContain('secret');
  });

  it('getFeatureFlag falls back on undefined or throw, otherwise uses the backend', async () => {
    const throwing = fakeBackend({ getFeatureFlag: () => Promise.reject(new Error('x')) });
    await expect(
      createTelemetry(ON, { backend: throwing.backend }).getFeatureFlag('seller_tui_enabled', true),
    ).resolves.toBe(true);
    const undef = fakeBackend();
    await expect(
      createTelemetry(ON, { backend: undef.backend }).getFeatureFlag('seller_tui_enabled', false),
    ).resolves.toBe(false);
    const off = fakeBackend({ getFeatureFlag: () => Promise.resolve(false) });
    await expect(
      createTelemetry(ON, { backend: off.backend }).getFeatureFlag('seller_tui_enabled', true),
    ).resolves.toBe(false);
  });

  it('flush resolves within the timeout even if the backend never does', async () => {
    const { backend } = fakeBackend({ flush: () => new Promise<void>(() => undefined) });
    const t = createTelemetry(ON, { backend });
    const start = Date.now();
    await t.flush(50);
    expect(Date.now() - start).toBeLessThan(100);
  });
});

describe('stripUrlQueries', () => {
  it('keeps origin and path only', () => {
    expect(stripUrlQueries('see https://a.com/p/q?x=1&y=2#z and http://b.org/?k=v done')).toBe(
      'see https://a.com/p/q and http://b.org/ done',
    );
  });
});
