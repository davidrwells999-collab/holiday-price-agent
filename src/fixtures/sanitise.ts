import { DETECTORS, applyDetector, looksOpaque } from './detectors.js';

type Env = Readonly<Record<string, string | undefined>>;

const DENIED_PARAM =
  /^(utm_|gclid|fbclid|msclkid|_ga|_gl|session|sid|token|auth|key|sig|signature|jsessionid|phpsessid)/i;

const URL_IN_TEXT = /https?:\/\/[^\s"'<>]*[^\s"'<>.,;:)]/g;

const BLOCK_TAGS = ['script', 'style', 'noscript', 'template', 'iframe'] as const;

/**
 * Drop the fragment and any tracking, session or opaque-token query params.
 * Works on the raw string so the rest of the URL is left byte-for-byte alone.
 */
export function sanitiseUrl(url: string): string {
  const encodedAmp = url.includes('&amp;');
  const raw = encodedAmp ? url.replaceAll('&amp;', '&') : url;
  const noHash = raw.split('#', 1)[0] ?? '';
  const q = noHash.indexOf('?');
  if (q === -1) return noHash;
  const base = noHash.slice(0, q);
  const kept = noHash
    .slice(q + 1)
    .split('&')
    .filter((pair) => {
      if (pair === '') return false;
      const eq = pair.indexOf('=');
      const name = eq === -1 ? pair : pair.slice(0, eq);
      const value = eq === -1 ? '' : pair.slice(eq + 1);
      if (DENIED_PARAM.test(name)) return false;
      return !(/^[A-Za-z0-9_-]{24,}$/.test(value) && looksOpaque(value));
    });
  const out = kept.length > 0 ? `${base}?${kept.join('&')}` : base;
  return encodedAmp ? out.replaceAll('&', '&amp;') : out;
}

export function sanitiseText(text: string, env: Env = process.env): string {
  let out = applyDetector(text, DETECTORS[0] as (typeof DETECTORS)[number]); // cookie lines first
  out = out.replace(URL_IN_TEXT, (u) => sanitiseUrl(u));
  for (const detector of DETECTORS) {
    if (detector.kind === 'unsanitised_script' || detector.kind === 'cookie_header') continue;
    out = applyDetector(out, detector);
  }
  const topic = env.NTFY_TOPIC;
  if (topic !== undefined && topic.length >= 8) {
    out = out.replaceAll(topic, '[REDACTED_NTFY_TOPIC]');
  }
  return out;
}

export function sanitiseHtml(html: string, env: Env = process.env): string {
  let out = html;
  for (const tag of BLOCK_TAGS) {
    out = out.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), '');
    out = out.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi'), ''); // unterminated leftovers
  }
  out = out.replace(/<!--[\s\S]*?-->/g, '');
  out = out.replace(/\sdata-[\w-]+(?:=(?:"[^"]*"|'[^']*'|[^\s>]*))?/gi, '');
  out = out.replace(/\son\w+=(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');
  out = out.replace(
    /\b(href|src)=(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi,
    (_m, attr: string, dq: string | undefined, sq: string | undefined, bare: string | undefined) =>
      dq !== undefined
        ? `${attr}="${sanitiseUrl(dq)}"`
        : sq !== undefined
          ? `${attr}='${sanitiseUrl(sq)}'`
          : `${attr}=${sanitiseUrl(bare ?? '')}`,
  );
  return sanitiseText(out, env);
}
