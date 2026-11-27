import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'smol-toml';
import { describe, expect, it } from 'vitest';
import { THRESHOLDS } from '../evals/thresholds.js';

const root = resolve(import.meta.dirname, '..');
const read = (p: string): string => readFileSync(resolve(root, p), 'utf8');

interface PackageRule {
  groupName?: string;
  matchPackageNames?: string[];
  matchManagers?: string[];
  matchDatasources?: string[];
  allowedVersions?: string;
}
interface RenovateConfig {
  extends: string[];
  timezone: string;
  minimumReleaseAge?: string;
  internalChecksFilter?: string;
  packageRules: PackageRule[];
}

const renovate = JSON.parse(read('renovate.json')) as RenovateConfig;
const rules = renovate.packageRules;
const group = (name: string): PackageRule | undefined => rules.find((r) => r.groupName === name);
const allowed = (pkg: string): string | undefined =>
  rules.find((r) => r.matchPackageNames?.includes(pkg) && r.allowedVersions)?.allowedVersions;

describe('.pr_agent.toml (read-only contract)', () => {
  const cfg = parse(read('.pr_agent.toml')) as {
    github_app: { pr_commands: string[] };
    review_agent: { issues_user_guidelines?: string; compliance_user_guidelines?: string };
  };

  it('auto-runs describe and review', () => {
    expect(cfg.github_app.pr_commands).toContain('/agentic_describe');
    expect(cfg.github_app.pr_commands).toContain('/agentic_review');
  });

  it('covers the four rule areas', () => {
    const text = (
      (cfg.review_agent.issues_user_guidelines ?? '') +
      (cfg.review_agent.compliance_user_guidelines ?? '')
    ).toLowerCase();
    for (const s of ['src/sellers', 'src/pricing', 'src/agent', 'evals/', 'posthog']) {
      expect(text).toContain(s.toLowerCase());
    }
  });

  it('has no .coderabbit.yaml', () => {
    expect(existsSync(resolve(root, '.coderabbit.yaml'))).toBe(false);
  });
});

describe('renovate.json', () => {
  it('extends the base presets and uses London time', () => {
    expect(renovate.extends).toContain('config:recommended');
    expect(renovate.extends).toContain('helpers:pinGitHubActionDigests');
    expect(renovate.timezone).toBe('Europe/London');
  });

  it('waits before proposing just-published releases (supply-chain buffer)', () => {
    expect(renovate.minimumReleaseAge).toBe('3 days');
    expect(renovate.internalChecksFilter).toBe('strict');
  });

  it('groups lockstep packages', () => {
    expect(group('vitest')?.matchPackageNames).toEqual(
      expect.arrayContaining(['vitest', '@vitest/**']),
    );
    expect(group('drizzle')?.matchPackageNames).toEqual(
      expect.arrayContaining(['drizzle-orm', 'drizzle-kit']),
    );
    expect(group('lint and format')?.matchPackageNames).toContain('eslint');
    expect(group('github actions')?.matchManagers).toContain('github-actions');
  });

  it('holds back majors', () => {
    expect(allowed('typescript')).toBe('<6.1.0');
    expect(allowed('drizzle-orm')).toBe('<1.0.0');
    expect(allowed('drizzle-kit')).toBe('<1.0.0');
    expect(allowed('@types/node')).toBe('<23.0.0');
    expect(allowed('node')).toBe('/^22\\./');
    expect(allowed('postgres')).toBe('/^17\\./');
  });
});

describe('PR template', () => {
  const t = read('.github/pull_request_template.md');

  it('has the required headings in order', () => {
    const heads = [
      '## Summary',
      '## Test evidence',
      '## Qodo Merge review',
      '## Risks and dependencies',
      '## Checklist',
    ].map((h) => t.indexOf(h));
    expect(heads.every((i) => i >= 0)).toBe(true);
    expect([...heads].sort((a, b) => a - b)).toEqual(heads);
  });

  it('has the fixtures checkbox and no CodeRabbit mention', () => {
    expect(t).toContain('- [ ] Fixtures sanitised');
    expect(t.toLowerCase()).not.toContain('coderabbit');
  });
});

describe('eval thresholds', () => {
  it('are the agreed values', () => {
    expect(THRESHOLDS.extraction.hardFields).toBe(1);
    expect(THRESHOLDS.extraction.overall).toBe(0.95);
    expect(THRESHOLDS.trueCost.exact).toBe(1);
    expect(THRESHOLDS.alerts.mustAlertMisses).toBe(0);
    expect(THRESHOLDS.alerts.maxFalseAlertsPer20).toBe(1);
    expect(THRESHOLDS.safety.pass).toBe(1);
  });
});
