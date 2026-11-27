import { pino, type DestinationStream, type Logger } from 'pino';
import type { Env } from '../config/env.js';

const SECRET_KEYS = [
  'ANTHROPIC_API_KEY',
  'NTFY_TOPIC',
  'NTFY_TOKEN',
  'POSTHOG_API_KEY',
  'DATABASE_URL',
  'POSTGRES_PASSWORD',
] as const;

export const REDACT_PATHS: string[] = [
  ...SECRET_KEYS,
  ...SECRET_KEYS.map((k) => `env.${k}`),
  '*.authorization',
  'headers.authorization',
  'headers.cookie',
];

export type { Logger };

export function createLogger(level: Env['LOG_LEVEL'], destination?: DestinationStream): Logger {
  const options = {
    level,
    base: { service: 'holiday-price-agent' },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  };
  return destination ? pino(options, destination) : pino(options);
}
