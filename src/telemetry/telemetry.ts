import { createHash } from 'node:crypto';
import { isPostHogEnabled, type Env } from '../config/env.js';
import {
  DISTINCT_ID,
  EVENT_SCHEMAS,
  EXCEPTION_SCHEMA,
  type ExceptionProps,
  type EventName,
  type EventProps,
  type FlagKey,
} from './events.js';

export interface TelemetryBackend {
  readonly enabled: boolean;
  capture(input: {
    distinctId: string;
    event: EventName;
    properties: Record<string, unknown>;
  }): void | Promise<void>;
  captureException(input: { distinctId: string } & ExceptionProps): void | Promise<void>;
  getFeatureFlag(key: FlagKey, distinctId: string): Promise<boolean | undefined>;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
}

export const noopBackend: TelemetryBackend = {
  enabled: false,
  capture: () => undefined,
  captureException: () => undefined,
  getFeatureFlag: () => Promise.resolve(undefined),
  flush: () => Promise.resolve(),
  shutdown: () => Promise.resolve(),
};

export interface Telemetry {
  readonly enabled: boolean;
  capture<E extends EventName>(event: E, props: EventProps<E>): void;
  captureException(error: unknown): void;
  getFeatureFlag(key: FlagKey, fallback: boolean): Promise<boolean>;
  flush(timeoutMs?: number): Promise<void>;
  shutdown(timeoutMs?: number): Promise<void>;
}

export type DropReason = 'unknown_event' | 'invalid_props' | 'backend_error';

export interface TelemetryOptions {
  backend?: TelemetryBackend;
  onDropped?: (info: { event: string; reason: DropReason }) => void;
}

const URL_PATTERN = /https?:\/\/[^\s?#]+(?:\?[^\s#]*)?(?:#\S*)?/g;

/** Reduces every URL in the text to origin + path (query string and fragment removed). */
export function stripUrlQueries(text: string): string {
  return text.replace(URL_PATTERN, (match) => match.replace(/[?#].*$/, ''));
}

function withTimeout(work: () => Promise<void>, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    timer.unref();
    let promise: Promise<void>;
    try {
      promise = Promise.resolve(work());
    } catch {
      clearTimeout(timer);
      resolve();
      return;
    }
    promise.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      () => {
        clearTimeout(timer);
        resolve();
      },
    );
  });
}

export function createTelemetry(
  env: Pick<Env, 'POSTHOG_API_KEY'>,
  options: TelemetryOptions = {},
): Telemetry {
  const backend = isPostHogEnabled(env) && options.backend ? options.backend : noopBackend;
  const drop = (event: string, reason: DropReason): void => {
    try {
      options.onDropped?.({ event, reason });
    } catch {
      // analytics must never throw
    }
  };
  const swallow = (event: string, call: () => void | Promise<void>): void => {
    try {
      const result = call();
      if (result instanceof Promise) result.catch(() => drop(event, 'backend_error'));
    } catch {
      drop(event, 'backend_error');
    }
  };

  return {
    enabled: backend.enabled,
    capture(event, props) {
      const schema = (EVENT_SCHEMAS as Record<string, (typeof EVENT_SCHEMAS)[EventName]>)[event];
      if (!Object.hasOwn(EVENT_SCHEMAS, event) || !schema) {
        drop(String(event), 'unknown_event');
        return;
      }
      const parsed = schema.safeParse(props);
      if (!parsed.success) {
        drop(event, 'invalid_props');
        return;
      }
      swallow(event, () =>
        backend.capture({
          distinctId: DISTINCT_ID,
          event,
          properties: parsed.data,
        }),
      );
    },
    captureException(error) {
      // Message text is never forwarded (it can hold emails, tokens or connection strings).
      const message = error instanceof Error ? error.message : '';
      const parsed = EXCEPTION_SCHEMA.safeParse({
        error_name: error instanceof Error ? error.name : 'NonError',
        message_sha256: createHash('sha256').update(message).digest('hex').slice(0, 16),
        message_length: message.length,
      });
      const props: ExceptionProps = parsed.success
        ? parsed.data
        : {
            error_name: 'Error',
            message_sha256: createHash('sha256').update(message).digest('hex').slice(0, 16),
            message_length: message.length,
          };
      swallow('exception', () => backend.captureException({ distinctId: DISTINCT_ID, ...props }));
    },
    async getFeatureFlag(key, fallback) {
      try {
        const value = await backend.getFeatureFlag(key, DISTINCT_ID);
        return value ?? fallback;
      } catch {
        return fallback;
      }
    },
    flush: (timeoutMs = 5000) => withTimeout(() => backend.flush(), timeoutMs),
    shutdown: (timeoutMs = 5000) => withTimeout(() => backend.shutdown(), timeoutMs),
  };
}
