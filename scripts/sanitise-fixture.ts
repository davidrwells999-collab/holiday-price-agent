import { readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import { sanitiseHtml, sanitiseText } from '../src/fixtures/sanitise.js';
import { scanContent } from '../src/fixtures/scan.js';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: pnpm sanitise:fixture <input> <output>');
  process.exit(2);
}

const isHtml = extname(input).toLowerCase() === '.html';
const raw = readFileSync(input, 'utf8');
const clean = isHtml ? sanitiseHtml(raw) : sanitiseText(raw);
writeFileSync(output, clean);

const remaining = scanContent(clean, { path: output, isHtml });
if (remaining.length > 0) {
  for (const f of remaining) console.error(`${f.path}:${f.line} ${f.kind} ${f.preview}`);
  console.error('Sanitised output still contains sensitive content; do not commit it.');
  process.exit(1);
}
console.log(`sanitised ${input} -> ${output}`);
