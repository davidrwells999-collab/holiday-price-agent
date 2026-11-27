import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, relative } from 'node:path';
import { DETECTORS, firstMatch, maskValue, type FindingKind } from './detectors.js';

type Env = Readonly<Record<string, string | undefined>>;

export interface Finding {
  path: string;
  line: number;
  kind: FindingKind;
  /** Masked preview only. The matched value is never stored. */
  preview: string;
}

export interface ScanOptions {
  path: string;
  isHtml: boolean;
  env?: Env;
}

const SCANNED_EXTENSIONS = new Set(['.txt', '.html', '.json', '.md']);

export function scanContent(content: string, options: ScanOptions): Finding[] {
  const env = options.env ?? process.env;
  const topic = env.NTFY_TOPIC;
  const findings: Finding[] = [];
  const lines = content.split(/\r?\n/);
  lines.forEach((text, index) => {
    const line = index + 1;
    for (const detector of DETECTORS) {
      if (detector.kind === 'unsanitised_script' && !options.isHtml) continue;
      const match = firstMatch(text, detector);
      if (match !== undefined) {
        findings.push({
          path: options.path,
          line,
          kind: detector.kind,
          preview: maskValue(match, detector.kind),
        });
      }
    }
    if (topic !== undefined && topic.length >= 8 && text.includes(topic)) {
      findings.push({
        path: options.path,
        line,
        kind: 'ntfy_topic',
        preview: maskValue(topic, 'ntfy_topic'),
      });
    }
  });
  return findings;
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

export interface ScanPathsOptions {
  /** Paths in findings are relative to this directory. Defaults to process.cwd(). */
  cwd?: string;
  env?: Env;
}

export class FixturesRootNotFoundError extends Error {
  constructor(root: string) {
    super(`fixtures root not found: ${root}`);
    this.name = 'FixturesRootNotFoundError';
  }
}

export function scanPaths(root: string, options: ScanPathsOptions = {}): Finding[] {
  if (!existsSync(root)) {
    // A configured root that is missing must never read as "clean".
    throw new FixturesRootNotFoundError(root);
  }
  const cwd = options.cwd ?? process.cwd();
  const findings: Finding[] = [];
  for (const file of walk(root)) {
    const ext = extname(file).toLowerCase();
    if (!SCANNED_EXTENSIONS.has(ext)) continue;
    // README.md at the fixtures root documents the rules and may mention examples.
    if (relative(root, file) === 'README.md') continue;
    findings.push(
      ...scanContent(readFileSync(file, 'utf8'), {
        path: relative(cwd, file),
        isHtml: ext === '.html',
        ...(options.env ? { env: options.env } : {}),
      }),
    );
  }
  return findings;
}

/**
 * Plants one sample of every kind in a temp dir, scans it and returns the kinds the scan
 * failed to detect. An empty array means the gate works. Samples are assembled at runtime.
 */
export function selfTest(): FindingKind[] {
  const topic = 'self-test-' + 'topic';
  const planted: Record<FindingKind, { file: string; text: string }> = {
    email: { file: 'a.txt', text: 'jane.doe' + '@' + 'example.com' },
    uk_phone: { file: 'b.txt', text: '07700 ' + '900123' },
    uk_postcode: { file: 'c.txt', text: 'B26 ' + '3QJ' },
    jwt: { file: 'd.txt', text: ['eyJhbGciOi', 'JIUzI1NiJ9', '.e30.', 'sig'].join('') },
    api_key: { file: 'e.txt', text: 'sk-' + 'ant-' + 'a1'.repeat(20) },
    opaque_token: { file: 'f.txt', text: 'Zx9' + 'Qw8'.repeat(12) },
    cookie_header: { file: 'g.txt', text: 'Set-' + 'Cookie: sid=1' },
    ntfy_topic: { file: 'h.txt', text: topic },
    ntfy_url: { file: 'h2.txt', text: 'https://' + 'ntfy.sh/' + 'some-topic-name' },
    ntfy_topic_assignment: { file: 'h3.txt', text: 'NTFY_' + 'TOPIC=' + 'some-topic-name' },
    unsanitised_script: { file: 'i.html', text: '<scr' + 'ipt>1</scr' + 'ipt>' },
  };
  const dir = mkdtempSync(join(tmpdir(), 'fixture-selftest-'));
  try {
    mkdirSync(join(dir, 'planted'));
    for (const { file, text } of Object.values(planted)) {
      writeFileSync(join(dir, 'planted', file), `${text}\n`);
    }
    const found = new Set(
      scanPaths(dir, { cwd: dir, env: { NTFY_TOPIC: topic } }).map((f) => f.kind),
    );
    return (Object.keys(planted) as FindingKind[]).filter((kind) => !found.has(kind));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
