export type FindingKind =
  | 'email'
  | 'uk_phone'
  | 'uk_postcode'
  | 'jwt'
  | 'api_key'
  | 'opaque_token'
  | 'cookie_header'
  | 'ntfy_topic'
  | 'unsanitised_script';

export interface Detector {
  kind: FindingKind;
  /** Global regex. Never use `.test`/`.exec` on it directly; use the helpers below. */
  pattern: RegExp;
  replacement: string;
  /** Optional post-filter on a regex match (keeps the regex itself linear-time). */
  accept?: (match: string) => boolean;
}

/** An opaque token mixes letters and digits; this keeps long hyphenated slugs and pure numbers. */
export const looksOpaque = (value: string): boolean => /[A-Za-z]/.test(value) && /\d/.test(value);

/**
 * Ordered: specific kinds before generic ones. Shared by the sanitiser (redacts)
 * and the scanner (reports), so the two can never drift apart.
 */
export const DETECTORS: ReadonlyArray<Detector> = [
  {
    kind: 'cookie_header',
    pattern: /^[ \t]*(?:Set-)?Cookie:[^\n]*$/gim,
    replacement: '[REDACTED_COOKIE]',
  },
  {
    kind: 'api_key',
    pattern:
      /(?:sk-ant-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{20,}|phc_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})/g,
    replacement: '[REDACTED_API_KEY]',
  },
  {
    kind: 'jwt',
    pattern: /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]*/g,
    replacement: '[REDACTED_JWT]',
  },
  {
    kind: 'email',
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g,
    replacement: '[REDACTED_EMAIL]',
  },
  {
    kind: 'uk_phone',
    pattern: /(?:\+44[\s-]?|\b0)\d{3,4}[\s-]?\d{3}[\s-]?\d{3,4}\b/g,
    replacement: '[REDACTED_PHONE]',
  },
  {
    // Requires the inward part (digit + two letters), so airport codes like BHX never match.
    kind: 'uk_postcode',
    pattern: /\b[A-Z]{1,2}\d[A-Z\d]?[ ]?\d[A-Z]{2}\b/g,
    replacement: '[REDACTED_POSTCODE]',
  },
  {
    kind: 'opaque_token',
    pattern: /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{32,}/g,
    replacement: '[REDACTED_TOKEN]',
    accept: looksOpaque,
  },
  {
    // Only reported for HTML fixtures; the sanitiser removes script blocks structurally instead.
    kind: 'unsanitised_script',
    pattern: /<script\b/gi,
    replacement: '',
  },
];

/** Replace every accepted match of a detector in the text. */
export function applyDetector(text: string, detector: Detector): string {
  return text.replace(detector.pattern, (match) =>
    detector.accept && !detector.accept(match) ? match : detector.replacement,
  );
}

/** First accepted match of a detector in the text, or undefined. */
export function firstMatch(text: string, detector: Detector): string | undefined {
  for (const m of text.matchAll(detector.pattern)) {
    if (!detector.accept || detector.accept(m[0])) return m[0];
  }
  return undefined;
}

/** Masked preview that never reveals more than the first character. */
export function maskValue(value: string, kind?: FindingKind): string {
  if (kind === 'ntfy_topic' || value.length === 0) return '***';
  const first = value.charAt(0);
  return kind === 'email' ? `${first}***@***` : `${first}***`;
}
