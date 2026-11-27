import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger } from './logger.js';

function capture(): { stream: Writable; lines: () => string } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      chunks.push(chunk.toString());
      cb();
    },
  });
  return { stream, lines: () => chunks.join('') };
}

describe('createLogger', () => {
  it('redacts secrets at top level, under env and in headers', () => {
    const { stream, lines } = capture();
    const logger = createLogger('info', stream);
    logger.info(
      {
        ANTHROPIC_API_KEY: 'sk-ant-x',
        POSTHOG_API_KEY: 'phc_secret',
        POSTGRES_PASSWORD: 'pw-secret',
        env: {
          NTFY_TOPIC: 'topic-secret',
          NTFY_TOKEN: 'token-secret',
          DATABASE_URL: 'postgres://u:p@h/d',
        },
        headers: { authorization: 'Bearer z', cookie: 'sid=abc' },
        req: { authorization: 'Bearer q' },
      },
      'hello',
    );
    const out = lines();
    for (const raw of [
      'sk-ant-x',
      'phc_secret',
      'pw-secret',
      'topic-secret',
      'token-secret',
      'postgres://u:p@h/d',
      'Bearer z',
      'sid=abc',
      'Bearer q',
    ]) {
      expect(out).not.toContain(raw);
    }
    expect(out.match(/\[REDACTED\]/g)?.length).toBe(9);
  });

  it('writes JSON with the service name', () => {
    const { stream, lines } = capture();
    createLogger('info', stream).info({ a: 1 }, 'msg');
    const parsed = JSON.parse(lines()) as Record<string, unknown>;
    expect(parsed.service).toBe('holiday-price-agent');
    expect(parsed.msg).toBe('msg');
  });
});
