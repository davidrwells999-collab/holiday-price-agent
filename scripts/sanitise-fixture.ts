import { sanitiseFile } from '../src/fixtures/sanitise-file.js';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: pnpm sanitise:fixture <input> <output>');
  process.exit(2);
}

const result = sanitiseFile(input, output);
if (!result.written) {
  for (const f of result.findings) console.error(`${f.path}:${f.line} ${f.kind} ${f.preview}`);
  console.error('Sanitised output still contains sensitive content; nothing was written.');
  process.exit(1);
}
console.log(`sanitised ${input} -> ${output}`);
