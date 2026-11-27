import { describe, expect, it } from 'vitest';
import { EnvValidationError, isOtlpEnabled, isPostHogEnabled, loadDbEnv, loadEnv } from './env.js';

const valid = {
  ANTHROPIC_API_KEY: 'sk-ant-test',
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  NTFY_TOPIC: 'my-topic_1',
};

function catchError(fn: () => unknown): EnvValidationError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(EnvValidationError);
    return e as EnvValidationError;
  }
  throw new Error('expected loadEnv to throw');
}

describe('loadEnv', () => {
  it('returns a typed env with defaults', () => {
    const env = loadEnv(valid);
    expect(env.POSTHOG_HOST).toBe('https://eu.i.posthog.com');
    expect(env.NTFY_SERVER).toBe('https://ntfy.sh');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.NODE_ENV).toBe('development');
  });

  it('names a missing required variable', () => {
    const rest: Record<string, string> = { ...valid };
    delete rest.ANTHROPIC_API_KEY;
    const err = catchError(() => loadEnv(rest));
    expect(err.message).toContain('ANTHROPIC_API_KEY');
    expect(err.message.toLowerCase()).toContain('required');
    expect(err.issues[0]?.variable).toBe('ANTHROPIC_API_KEY');
  });

  it('treats empty-string optional vars as unset', () => {
    const env = loadEnv({
      ...valid,
      POSTHOG_API_KEY: '',
      OTEL_EXPORTER_OTLP_ENDPOINT: '',
      NTFY_TOKEN: '',
      POSTHOG_HOST: '',
    });
    expect(env.POSTHOG_API_KEY).toBeUndefined();
    expect(env.OTEL_EXPORTER_OTLP_ENDPOINT).toBeUndefined();
    expect(env.POSTHOG_HOST).toBe('https://eu.i.posthog.com');
  });

  it('rejects a non-postgres DATABASE_URL', () => {
    const err = catchError(() => loadEnv({ ...valid, DATABASE_URL: 'mysql://x/y' }));
    expect(err.message).toContain('DATABASE_URL');
  });

  it('rejects NTFY_TOPIC with a space or over 64 chars', () => {
    expect(() => loadEnv({ ...valid, NTFY_TOPIC: 'has space' })).toThrow(EnvValidationError);
    expect(() => loadEnv({ ...valid, NTFY_TOPIC: 'a'.repeat(65) })).toThrow(EnvValidationError);
  });

  it('never leaks supplied values in the error message', () => {
    const err = catchError(() =>
      loadEnv({
        ...valid,
        ANTHROPIC_API_KEY: 'sk-ant-SECRETVALUE',
        DATABASE_URL: 'not-a-url-BADVALUE',
        NTFY_TOPIC: 'bad topic LEAKME',
      }),
    );
    expect(err.message).not.toContain('SECRETVALUE');
    expect(err.message).not.toContain('BADVALUE');
    expect(err.message).not.toContain('LEAKME');
    expect(err.message).toContain('DATABASE_URL');
  });

  it('rejects an invalid LOG_LEVEL without echoing it', () => {
    const err = catchError(() => loadEnv({ ...valid, LOG_LEVEL: 'LOUDVALUE' }));
    expect(err.message).toContain('LOG_LEVEL');
    expect(err.message).not.toContain('LOUDVALUE');
  });
});

describe('loadDbEnv', () => {
  it('requires only DATABASE_URL', () => {
    expect(loadDbEnv({ DATABASE_URL: valid.DATABASE_URL }).DATABASE_URL).toBe(valid.DATABASE_URL);
  });

  it('fails without DATABASE_URL', () => {
    expect(() => loadDbEnv({})).toThrow(EnvValidationError);
  });
});

describe('feature enablement helpers', () => {
  it('isPostHogEnabled mirrors POSTHOG_API_KEY', () => {
    expect(isPostHogEnabled({ POSTHOG_API_KEY: undefined })).toBe(false);
    expect(isPostHogEnabled({ POSTHOG_API_KEY: 'phc_x' })).toBe(true);
  });

  it('isOtlpEnabled mirrors OTEL_EXPORTER_OTLP_ENDPOINT', () => {
    expect(isOtlpEnabled({ OTEL_EXPORTER_OTLP_ENDPOINT: undefined })).toBe(false);
    expect(isOtlpEnabled({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://jaeger:4318' })).toBe(true);
  });
});
