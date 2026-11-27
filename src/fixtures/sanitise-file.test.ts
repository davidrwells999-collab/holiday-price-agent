import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sanitiseFile } from './sanitise-file.js';

describe('sanitiseFile', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sanitise-file-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes sanitised output when the scan is clean, leaving no temp files', () => {
    const input = join(dir, 'in.txt');
    const output = join(dir, 'out.txt');
    writeFileSync(input, 'mail jane.doe' + '@' + 'example.com now\n');
    const res = sanitiseFile(input, output, {});
    expect(res.written).toBe(true);
    expect(readFileSync(output, 'utf8')).toBe('mail [REDACTED_EMAIL] now\n');
    expect(readdirSync(dir).sort()).toEqual(['in.txt', 'out.txt']);
  });

  it('writes nothing and keeps an existing clean output when the scan finds leftovers', () => {
    const input = join(dir, 'in.txt');
    const output = join(dir, 'out.txt');
    writeFileSync(output, 'previous clean content\n');
    writeFileSync(input, 'hello\n');
    const leaky = (): string => 'mail jane.doe' + '@' + 'example.com\n';
    const res = sanitiseFile(input, output, {}, leaky);
    expect(res.written).toBe(false);
    expect(res.findings.map((f) => f.kind)).toEqual(['email']);
    expect(readFileSync(output, 'utf8')).toBe('previous clean content\n');
    expect(readdirSync(dir).sort()).toEqual(['in.txt', 'out.txt']);
  });

  it('cleans up the temp file and keeps the old output when the write fails', () => {
    const input = join(dir, 'in.txt');
    writeFileSync(input, 'hello\n');
    expect(() => sanitiseFile(input, join(dir, 'missing', 'out.txt'), {})).toThrow();
    expect(readdirSync(dir)).toEqual(['in.txt']);
  });
});
