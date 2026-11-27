import { z } from 'zod';

const emptyToUndefined = (value: unknown): unknown => (value === '' ? undefined : value);

function optional<T extends z.ZodType>(schema: T) {
  return z.preprocess(emptyToUndefined, schema.optional());
}

function withDefault<T extends z.ZodType>(schema: T, fallback: z.output<T>) {
  return z.preprocess(emptyToUndefined, schema.default(fallback as never));
}

const databaseUrl = z
  .string()
  .url({ error: 'must be a valid URL' })
  .refine((v) => v.startsWith('postgres://') || v.startsWith('postgresql://'), {
    error: 'must start with postgres:// or postgresql://',
  });

const EnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string({ error: 'Required' }).min(1, { error: 'Required' }),
  DATABASE_URL: databaseUrl,
  NTFY_TOPIC: z
    .string({ error: 'Required' })
    .regex(/^[A-Za-z0-9_-]{1,64}$/, { error: 'must be 1-64 characters of A-Z a-z 0-9 _ -' }),
  NTFY_SERVER: withDefault(z.string().url({ error: 'must be a valid URL' }), 'https://ntfy.sh'),
  NTFY_TOKEN: optional(z.string()),
  POSTHOG_API_KEY: optional(z.string()),
  POSTHOG_HOST: withDefault(
    z.string().url({ error: 'must be a valid URL' }),
    'https://eu.i.posthog.com',
  ),
  OTEL_EXPORTER_OTLP_ENDPOINT: optional(z.string().url({ error: 'must be a valid URL' })),
  LOG_LEVEL: withDefault(
    z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'], {
      error: 'must be one of fatal, error, warn, info, debug, trace',
    }),
    'info',
  ),
  NODE_ENV: withDefault(
    z.enum(['development', 'test', 'production'], {
      error: 'must be one of development, test, production',
    }),
    'development',
  ),
});

const DbEnvSchema = z.object({ DATABASE_URL: databaseUrl });

export type Env = z.output<typeof EnvSchema>;
export type DbEnv = z.output<typeof DbEnvSchema>;

export class EnvValidationError extends Error {
  readonly issues: { variable: string; message: string }[];

  constructor(issues: { variable: string; message: string }[]) {
    super(
      `Invalid environment configuration:\n${issues.map((i) => `- ${i.variable}: ${i.message}`).join('\n')}`,
    );
    this.name = 'EnvValidationError';
    this.issues = issues;
  }
}

function parse<S extends z.ZodType>(schema: S, source: NodeJS.ProcessEnv): z.output<S> {
  const result = schema.safeParse(source);
  if (result.success) return result.data;
  // Only path + message are used; never issue.input or any received value.
  throw new EnvValidationError(
    result.error.issues.map((issue) => ({
      variable: issue.path.map(String).join('.') || '(root)',
      message: issue.message,
    })),
  );
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return parse(EnvSchema, source);
}

export function loadDbEnv(source: NodeJS.ProcessEnv = process.env): DbEnv {
  return parse(DbEnvSchema, source);
}

export function isPostHogEnabled(env: Pick<Env, 'POSTHOG_API_KEY'>): boolean {
  return env.POSTHOG_API_KEY !== undefined && env.POSTHOG_API_KEY !== '';
}

export function isOtlpEnabled(env: Pick<Env, 'OTEL_EXPORTER_OTLP_ENDPOINT'>): boolean {
  return env.OTEL_EXPORTER_OTLP_ENDPOINT !== undefined && env.OTEL_EXPORTER_OTLP_ENDPOINT !== '';
}
