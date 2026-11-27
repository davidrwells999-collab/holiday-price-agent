import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, basename } from 'node:path';
import { sanitiseHtml, sanitiseText } from './sanitise.js';
import { scanContent, type Finding } from './scan.js';

type Env = Readonly<Record<string, string | undefined>>;

export interface SanitiseFileResult {
  written: boolean;
  findings: Finding[];
}

/**
 * Sanitises `input` and scans the result in memory. Writes `output` only when the scan is clean,
 * atomically (temp file in the same directory, then rename), so an existing clean output
 * survives a failed run untouched.
 */
export function sanitiseFile(
  input: string,
  output: string,
  env?: Env,
  /** Test seam: replaces the sanitiser to simulate content it fails to clean. */
  transform?: (raw: string, isHtml: boolean) => string,
): SanitiseFileResult {
  const isHtml = extname(input).toLowerCase() === '.html';
  const raw = readFileSync(input, 'utf8');
  const clean = transform
    ? transform(raw, isHtml)
    : isHtml
      ? sanitiseHtml(raw, env)
      : sanitiseText(raw, env);
  const findings = scanContent(clean, { path: output, isHtml, ...(env ? { env } : {}) });
  if (findings.length > 0) return { written: false, findings };
  const tmp = join(dirname(output), `.${basename(output)}.${process.pid}.tmp`);
  try {
    writeFileSync(tmp, clean);
    renameSync(tmp, output);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
  return { written: true, findings: [] };
}
