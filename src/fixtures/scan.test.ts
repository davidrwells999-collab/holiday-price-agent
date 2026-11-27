import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DETECTORS, type FindingKind } from './detectors.js';
import { scanContent, scanPaths, selfTest } from './scan.js';

// Secret-shaped values are assembled at runtime so this file never trips a secret scanner.
const samples: Record<Exclude<FindingKind, 'ntfy_topic'>, string> = {
  email: 'jane.doe' + '@' + 'example.com',
  uk_phone: '07700 ' + '900123',
  uk_postcode: 'B26 ' + '3QJ',
  jwt: ['eyJhbGciOi', 'JIUzI1NiJ9', '.e30.', 'sig'].join(''),
  api_key: 'sk-' + 'ant-' + 'a1'.repeat(20),
  opaque_token: 'Zx9' + 'Qw8'.repeat(12),
  cookie_header: 'Set-' + 'Cookie: sid=1; Path=/',
  unsanitised_script: '<scr' + 'ipt>var a=1</scr' + 'ipt>',
};

describe('scanContent', () => {
  it('returns no findings for clean sanitised text', () => {
    const text = 'Rixos Radamis £1,299 BHX 23:55 12 May 2027 [REDACTED_EMAIL]';
    expect(scanContent(text, { path: 'a.txt', isHtml: false })).toEqual([]);
  });

  it('reports line and kind, and never stores the matched value', () => {
    const email = samples.email;
    const findings = scanContent(`one\ntwo\nmail ${email} here`, { path: 'a.txt', isHtml: false });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ line: 3, kind: 'email', path: 'a.txt' });
    expect(findings[0]?.preview).toBe('j***@***');
    expect(JSON.stringify(findings)).not.toContain(email);
    expect(JSON.stringify(findings)).not.toContain('jane.doe');
  });

  it('flags script tags only in HTML fixtures', () => {
    const html = `<p>x</p>\n${samples.unsanitised_script}`;
    const found = scanContent(html, { path: 'a.html', isHtml: true });
    expect(found.map((f) => f.kind)).toEqual(['unsanitised_script']);
    expect(scanContent(html, { path: 'a.txt', isHtml: false })).toEqual([]);
  });

  it('flags the ntfy topic from the environment without echoing it', () => {
    const topic = 'holiday-' + 'watch';
    const found = scanContent(`topic ${topic}`, {
      path: 'a.txt',
      isHtml: false,
      env: { NTFY_TOPIC: topic },
    });
    expect(found).toMatchObject([{ line: 1, kind: 'ntfy_topic', preview: '***' }]);
  });

  it.each(Object.entries(samples))('detects kind %s', (kind, sample) => {
    const found = scanContent(sample, { path: 'a.html', isHtml: true, env: {} });
    expect(found.map((f) => f.kind)).toContain(kind);
  });

  it('has a sample for every detector kind', () => {
    for (const d of DETECTORS) expect(samples[d.kind as keyof typeof samples]).toBeDefined();
  });

  it('is stable across repeated calls (no regex lastIndex leakage)', () => {
    const opts = { path: 'a.txt', isHtml: false };
    const first = scanContent(samples.email, opts);
    expect(scanContent(samples.email, opts)).toEqual(first);
    expect(first).toHaveLength(1);
  });
});

describe('scanPaths', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'scan-test-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns findings only for the leaky file, with relative paths', () => {
    mkdirSync(join(root, 'jet2'));
    writeFileSync(join(root, 'jet2', 'clean.txt'), 'BHX 23:55 £1,299\n');
    writeFileSync(join(root, 'jet2', 'leaky.json'), `{"e": "${samples.email}"}\n`);
    const findings = scanPaths(root, { cwd: root, env: {} });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ path: join('jet2', 'leaky.json'), kind: 'email', line: 1 });
  });

  it('skips README.md at the root but scans nested markdown', () => {
    writeFileSync(join(root, 'README.md'), `rules mention ${samples.email}\n`);
    mkdirSync(join(root, 'x'));
    writeFileSync(join(root, 'x', 'notes.md'), `${samples.email}\n`);
    const findings = scanPaths(root, { cwd: root, env: {} });
    expect(findings.map((f) => f.path)).toEqual([join('x', 'notes.md')]);
  });

  it('returns [] for a missing root', () => {
    expect(scanPaths(join(root, 'nope'), { cwd: root, env: {} })).toEqual([]);
  });
});

describe('selfTest', () => {
  it('detects every planted kind', () => {
    expect(selfTest()).toEqual([]);
  });
});
