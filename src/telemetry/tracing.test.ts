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
    ).not.toBe(undefined);
  });
});

describe('guarded provider', () => {
  const env = { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://jaeger:4318', POSTHOG_API_KEY: undefined };

  function spy(): {
    provider: Tracing;
    initial: Record<string, unknown>[];
    set: [string, unknown][];
    errors: string[];
  } {
    const initial: Record<string, unknown>[] = [];
    const set: [string, unknown][] = [];
    const errors: string[] = [];
    const provider: Tracing = {
      enabled: true,
      withSpan: (_n, attrs, fn) => {
        initial.push(attrs);
        return fn({
          setAttribute: (k, v) => void set.push([k, v]),
          recordException: (e) => void errors.push((e as Error).message),
          setError: (m) => void errors.push(m),
        });
      },
      shutdown: () => Promise.resolve(),
    };
    return { provider, initial, set, errors };
  }

  it('filters initial attributes: drops unlisted keys and strips url secrets', async () => {
    const { provider, initial } = spy();
    const tracing = createTracing(env, { provider });
    expect(tracing.enabled).toBe(true);
    await tracing.withSpan(
      'page.navigate',
      {
        seller: 'jet2',
        url: 'https://example.com/h?sessionId=abc&token=x#f',
        page_text: 'secret body',
      } as never,
      () => Promise.resolve(),
    );
    expect(initial[0]).toEqual({ seller: 'jet2', url: 'https://example.com/h' });
  });

  it('filters later setAttribute calls', async () => {
    const { provider, set } = spy();
    const tracing = createTracing(env, { provider });
    await tracing.withSpan('run', {}, (span) => {
      span.setAttribute('page_text' as never, 'secret');
      span.setAttribute('url', 'https://example.com/a?auth=1');
      span.setAttribute('quotes', 3);
      return Promise.resolve();
    });
    expect(set).toEqual([
      ['url', 'https://example.com/a'],
      ['quotes', 3],
    ]);
  });

  it('strips url queries from error messages', async () => {
    const { provider, errors } = spy();
    const tracing = createTracing(env, { provider });
    await tracing.withSpan('run', {}, (span) => {
      span.setError('failed https://example.com/a?sid=1');
      span.recordException(new Error('bad https://example.com/b?token=2'));
      return Promise.resolve();
    });
    expect(errors).toEqual(['failed https://example.com/a', 'bad https://example.com/b']);
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
