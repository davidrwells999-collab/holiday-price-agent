import { describe, expect, it } from 'vitest';
import {
  SPAN_ATTRIBUTE_KEYS,
  SPAN_NAMES,
  createTracing,
  isAllowedSpanAttribute,
  sanitiseSpanAttribute,
  type Tracing,
} from './tracing.js';

describe('tracing no-op', () => {
  const tracing = createTracing({
    OTEL_EXPORTER_OTLP_ENDPOINT: undefined,
    POSTHOG_API_KEY: undefined,
  });

  it('is disabled', () => {
    expect(tracing.enabled).toBe(false);
  });

  it('returns the callback value', async () => {
    await expect(
      tracing.withSpan('seller.search', { seller: 'jet2' }, () => Promise.resolve(42)),
    ).resolves.toBe(42);
  });

  it('rethrows the callback error unchanged', async () => {
    const err = new Error('nope');
    await expect(tracing.withSpan('run', {}, () => Promise.reject(err))).rejects.toBe(err);
  });

  it('span methods never throw, even with disallowed keys', async () => {
    await tracing.withSpan('run', {}, (span) => {
      span.setAttribute('page_text' as never, 'x');
      span.recordException(new Error('x'));
      span.setError('x');
      return Promise.resolve();
    });
    await expect(tracing.shutdown()).resolves.toBeUndefined();
  });

  it('uses a supplied provider only when env enables tracing', () => {
    const provider: Tracing = {
      enabled: true,
      withSpan: (_n, _a, fn) => fn({} as never),
      shutdown: () => Promise.resolve(),
    };
    expect(
      createTracing(
        { OTEL_EXPORTER_OTLP_ENDPOINT: undefined, POSTHOG_API_KEY: undefined },
        { provider },
      ),
    ).not.toBe(provider);
    expect(
      createTracing(
        { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://jaeger:4318', POSTHOG_API_KEY: undefined },
        { provider },
      ),
    ).toBe(provider);
  });
});

describe('span attribute allow-list', () => {
  it('lists the span hierarchy', () => {
    expect(SPAN_NAMES).toContain('page.captcha_check');
  });

  it('allows only listed keys', () => {
    for (const key of SPAN_ATTRIBUTE_KEYS) expect(isAllowedSpanAttribute(key)).toBe(true);
    expect(isAllowedSpanAttribute('page_text')).toBe(false);
  });

  it('drops disallowed keys and strips url queries', () => {
    expect(sanitiseSpanAttribute('page_text', 'x')).toBeUndefined();
    expect(sanitiseSpanAttribute('url', 'https://a.com/x?token=S#f')).toBe('https://a.com/x');
    expect(sanitiseSpanAttribute('seller', 'jet2')).toBe('jet2');
  });
});
