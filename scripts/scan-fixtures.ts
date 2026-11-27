import { scanPaths, selfTest } from '../src/fixtures/scan.js';

const args = process.argv.slice(2);

if (args.includes('--self-test')) {
  const missed = selfTest();
  if (missed.length > 0) {
    console.error(`self-test FAILED: scan did not detect planted kinds: ${missed.join(', ')}`);
    process.exit(1);
  }
  console.log('self-test passed: every planted kind was detected');
  process.exit(0);
}

const root = args.find((a) => !a.startsWith('--')) ?? 'evals/fixtures';
const findings = scanPaths(root);
for (const f of findings) {
  console.log(`${f.path}:${f.line} ${f.kind} ${f.preview}`);
}
if (findings.length > 0) {
  console.error(`${findings.length} finding(s) in ${root}. Matched values are never printed.`);
  process.exit(1);
}
console.log(`fixture scan clean (${root})`);
