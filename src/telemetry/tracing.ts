import { isOtlpEnabled, isPostHogEnabled, type Env } from '../config/env.js';
import { stripUrlQueries } from './telemetry.js';

export const SPAN_NAMES = [
  'run',
  'seller',
  'seller.search',
  'page.navigate',
  'page.wait_for_price',
  'page.read_text',
  'page.captcha_check',
  'extract',
  'llm.call',
  'true_cost',
  'db.write',
  'alert',
] as const;
export type SpanName = (typeof SPAN_NAMES)[number];

export const SPAN_ATTRIBUTE_KEYS = [
  'run_id',
  'seller',
  'airport',
  'depart_date',
  'room_setup',
  'url',
  'status',
  'duration_ms',
  'captcha_detected',
  'text_bytes',
  'text_sha256',
  'quotes',
] as const;
export type SpanAttributeKey = (typeof SPAN_ATTRIBUTE_KEYS)[number];
export type SpanAttributeValue = string | number | boolean;

export function isAllowedSpanAttribute(key: string): key is SpanAttributeKey {
  return (SPAN_ATTRIBUTE_KEYS as readonly string[]).includes(key);
}

/** Applies the allow-list and URL sanitising; returns undefined when the attribute must be dropped. */
export function sanitiseSpanAttribute(
  key: string,
  value: SpanAttributeValue,
): SpanAttributeValue | undefined {
  if (!isAllowedSpanAttribute(key)) return undefined;
  if (key === 'url') return typeof value === 'string' ? stripUrlQueries(value) : undefined;
  return value;
}

export interface SpanHandle {
  setAttribute(key: SpanAttributeKey, value: SpanAttributeValue): void;
  recordException(error: unknown): void;
  setError(message: string): void;
}

export interface Tracing {
  readonly enabled: boolean;
  withSpan<T>(
    name: SpanName,
    attributes: Partial<Record<SpanAttributeKey, SpanAttributeValue>>,
    fn: (span: SpanHandle) => Promise<T>,
  ): Promise<T>;
  shutdown(timeoutMs?: number): Promise<void>;
}

const noopSpan: SpanHandle = {
  setAttribute: () => undefined,
  recordException: () => undefined,
  setError: () => undefined,
};

const noopTracing: Tracing = {
  enabled: false,
  withSpan: (_name, _attributes, fn) => fn(noopSpan),
  shutdown: () => Promise.resolve(),
};

/** Wraps a provider so every attribute (initial and later) is allow-listed and URL-sanitised. */
function sanitisingTracing(inner: Tracing): Tracing {
  const cleanAttributes = (
    attributes: Partial<Record<SpanAttributeKey, SpanAttributeValue>>,
  ): Partial<Record<SpanAttributeKey, SpanAttributeValue>> => {
    const out: Partial<Record<SpanAttributeKey, SpanAttributeValue>> = {};
    for (const [key, value] of Object.entries(attributes)) {
      if (value === undefined) continue;
      const clean = sanitiseSpanAttribute(key, value);
      if (clean !== undefined) out[key as SpanAttributeKey] = clean;
    }
    return out;
  };
  return {
    enabled: inner.enabled,
    withSpan: (name, attributes, fn) =>
      inner.withSpan(name, cleanAttributes(attributes), (span) =>
        fn({
          setAttribute: (key, value) => {
            const clean = sanitiseSpanAttribute(key, value);
            if (clean !== undefined) span.setAttribute(key, clean);
          },
          recordException: (error) => span.recordException(error),
          setError: (message) => span.setError(message),
        }),
      ),
    shutdown: (timeoutMs) => inner.shutdown(timeoutMs),
  };
}

export function createTracing(
  env: Pick<Env, 'OTEL_EXPORTER_OTLP_ENDPOINT' | 'POSTHOG_API_KEY'>,
  options: { provider?: Tracing } = {},
): Tracing {
  const enabled = isOtlpEnabled(env) || isPostHogEnabled(env);
  return enabled && options.provider ? sanitisingTracing(options.provider) : noopTracing;
}
