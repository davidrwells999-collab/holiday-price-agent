import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DETECTORS, type FindingKind } from './detectors.js';
import { FixturesRootNotFoundError, scanContent, scanPaths, selfTest } from './scan.js';

// Secret-shaped values are assembled at runtime so this file never trips a secret scanner.
const samples: Record<Exclude<FindingKind, 'ntfy_topic' | 'unscanned_file_type'>, string> = {
  email: 'jane.doe' + '@' + 'example.com',
  uk_phone: '07700 ' + '900123',
  uk_postcode: 'B26 ' + '3QJ',
  jwt: ['eyJhbGciOi', 'JIUzI1NiJ9', '.e30.', 'sig'].join(''),
  api_key: 'sk-' + 'ant-' + 'a1'.repeat(20),
  opaque_token: 'Zx9' + 'Qw8'.repeat(12),
  cookie_header: 'Set-' + 'Cookie: sid=1; Path=/',
  ntfy_url: 'see https://' + 'ntfy.sh/' + 'my-private-topic',
  ntfy_topic_assignment: 'NTFY_' + 'TOPIC=' + 'my-private-topic',
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

  it('flags ntfy URLs on any host containing ntfy, without needing the env topic', () => {
    const opts = { path: 'a.txt', isHtml: false, env: {} };
    for (const text of [
      'curl ntfy.sh/' + 'secret-topic-1',
      'https://' + 'ntfy.example.com/' + 'secret-topic-2',
      'http://my-ntfy-box.local/' + 'secret_topic_3',
    ]) {
      expect(scanContent(text, opts).map((f) => f.kind)).toContain('ntfy_url');
    }
    expect(scanContent('https://example.com/not-related', opts)).toEqual([]);
  });

  it('flags NTFY_TOPIC assignments without echoing the value', () => {
    const found = scanContent('NTFY_' + 'TOPIC="' + 'my-private-topic"', {
      path: 'a.txt',
      isHtml: false,
      env: {},
    });
    expect(found).toMatchObject([{ kind: 'ntfy_topic_assignment', preview: '***' }]);
    expect(JSON.stringify(found)).not.toContain('my-private-topic');
  });

  it('keeps the exact-match env check for local runs', () => {
    const found = scanContent('plain word ' + 'abcdefghij', {
      path: 'a.txt',
      isHtml: false,
      env: { NTFY_TOPIC: 'abcdefghij' },
    });
    expect(found.map((f) => f.kind)).toEqual(['ntfy_topic']);
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

  it('scans .har, .xml, .yaml, .csv and unknown extensions as text', () => {
    const cookie = 'Cookie: sid=1';
    for (const name of ['a.har', 'b.xml', 'c.yaml', 'd.csv', 'e.js', 'f.weird']) {
      writeFileSync(join(root, name), `${cookie}\n`);
    }
    const findings = scanPaths(root, { cwd: root, env: {} });
    expect(findings.map((f) => f.path).sort()).toEqual(
      ['a.har', 'b.xml', 'c.yaml', 'd.csv', 'e.js', 'f.weird'].sort(),
    );
    expect(findings.every((f) => f.kind === 'cookie_header')).toBe(true);
  });

  it('flags a .har with a cookie header inside JSON', () => {
    writeFileSync(
      join(root, 'trace.har'),
      '{"log":{"entries":[{"request":{"headers":[{"name":"Cookie","value":"sid=1"}]}}]}}\n' +
        'Set-' +
        'Cookie: sid=1\n',
    );
    const findings = scanPaths(root, { cwd: root, env: {} });
    expect(findings.map((f) => f.kind)).toContain('cookie_header');
  });

  it('treats .htm and .mhtml as HTML (script tags flagged)', () => {
    const script = '<scr' + 'ipt>1</scr' + 'ipt>\n';
    writeFileSync(join(root, 'a.htm'), script);
    writeFileSync(join(root, 'b.mhtml'), script);
    const findings = scanPaths(root, { cwd: root, env: {} });
    expect(findings.map((f) => f.kind)).toEqual(['unsanitised_script', 'unsanitised_script']);
  });

  it('flags binary and undecodable files as unscanned_file_type without echoing content', () => {
    writeFileSync(join(root, 'shot.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]));
    writeFileSync(join(root, 'bad.txt'), Buffer.from([0xff, 0xfe, 0xfd, 0x41]));
    const findings = scanPaths(root, { cwd: root, env: {} });
    expect(findings.map((f) => [f.path, f.kind]).sort()).toEqual([
      ['bad.txt', 'unscanned_file_type'],
      ['shot.png', 'unscanned_file_type'],
    ]);
  });

  it('scans .gitkeep placeholders as text and does not flag them', () => {
    writeFileSync(join(root, '.gitkeep'), '');
    expect(scanPaths(root, { cwd: root, env: {} })).toEqual([]);
  });

  it('fails explicitly for a missing root', () => {
    expect(() => scanPaths(join(root, 'nope'), { cwd: root, env: {} })).toThrow(
      FixturesRootNotFoundError,
    );
    expect(() => scanPaths(join(root, 'nope'), { cwd: root, env: {} })).toThrow(
      /fixtures root not found/,
    );
  });
});

describe('selfTest', () => {
  it('detects every planted kind', () => {
    expect(selfTest()).toEqual([]);
  });
});
