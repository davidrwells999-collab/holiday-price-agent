import { describe, expect, it } from 'vitest';
import { sanitiseHtml, sanitiseText, sanitiseUrl } from './sanitise.js';

// Secret-shaped values are assembled at runtime so this file never trips a secret scanner.
const fakeApiKey = (): string => 'sk-' + 'ant-' + 'a1'.repeat(20);
const fakeJwt = (): string => ['eyJhbGciOi', 'JIUzI1NiJ9', '.e30.', 'sig'].join('');
const fakeOpaque = (): string => 'Zx9' + 'Qw8'.repeat(12);
const noEnv = {};

describe('sanitiseHtml', () => {
  it('removes script blocks, including ld+json and multi-line scripts', () => {
    const html =
      '<p>£1,299</p><script>var t="x"</script>' +
      '<script type="application/ld+json">{\n"a": 1\n}\n</script><p>end</p>';
    expect(sanitiseHtml(html, noEnv)).toBe('<p>£1,299</p><p>end</p>');
  });

  it('removes style, noscript, template, iframe blocks and comments', () => {
    const html =
      '<style>.a{color:red}</style><noscript>x</noscript><template><b>t</b></template>' +
      '<iframe src="https://example.com/frame"></iframe><!-- secret\ncomment --><p>ok</p>';
    expect(sanitiseHtml(html, noEnv)).toBe('<p>ok</p>');
  });

  it('removes data-* attributes and inline event handlers', () => {
    const html = '<div data-session="abc" data-test-id="x" class="price" onclick="go()">£10</div>';
    expect(sanitiseHtml(html, noEnv)).toBe('<div class="price">£10</div>');
  });

  it('keeps prices, flight times, dates, airport codes and hotel names', () => {
    const html =
      '<p>Rixos Radamis, £1,299 pp, BHX 23:55 to SSH, 12 May 2027, BRS direct</p>';
    expect(sanitiseHtml(html, noEnv)).toBe(html);
  });

  it('sanitises URLs inside href and src attributes', () => {
    const html = '<a href="/hotel?duration=7&amp;sessionId=abc&amp;airport=98#top">x</a>';
    expect(sanitiseHtml(html, noEnv)).toBe('<a href="/hotel?duration=7&amp;airport=98">x</a>');
  });
});

describe('sanitiseText', () => {
  it('redacts emails', () => {
    expect(sanitiseText('contact jane.doe@example.com', noEnv)).toBe(
      'contact [REDACTED_EMAIL]',
    );
  });

  it.each(['07700 900123', '+44 7700 900123', '0121 496 0000'])('redacts phone %s', (phone) => {
    expect(sanitiseText(`call ${phone} now`, noEnv)).toBe('call [REDACTED_PHONE] now');
  });

  it('redacts UK postcodes but not airport codes', () => {
    expect(sanitiseText('B26 3QJ and BS48 3DY', noEnv)).toBe(
      '[REDACTED_POSTCODE] and [REDACTED_POSTCODE]',
    );
    expect(sanitiseText('BHX to BRS', noEnv)).toBe('BHX to BRS');
  });

  it('redacts JWTs, API keys and opaque tokens', () => {
    expect(sanitiseText(`t=${fakeJwt()}`, noEnv)).toBe('t=[REDACTED_JWT]');
    expect(sanitiseText(`k ${fakeApiKey()}`, noEnv)).toBe('k [REDACTED_API_KEY]');
    expect(sanitiseText(`id ${fakeOpaque()}`, noEnv)).toBe('id [REDACTED_TOKEN]');
  });

  it('does not treat long hyphenated words without digits as tokens', () => {
    const text = 'rixos-radamis-sharm-el-sheikh-resort-and-spa';
    expect(sanitiseText(text, noEnv)).toBe(text);
  });

  it('redacts cookie header lines', () => {
    expect(sanitiseText('a\nSet-Cookie: sid=1; Path=/\nCookie: x=y\nb', noEnv)).toBe(
      'a\n[REDACTED_COOKIE]\n[REDACTED_COOKIE]\nb',
    );
  });

  it('redacts the NTFY_TOPIC value when set and long enough', () => {
    const topic = 'holiday-' + 'watch';
    expect(sanitiseText(`topic ${topic}`, { NTFY_TOPIC: topic })).toBe(
      'topic [REDACTED_NTFY_TOPIC]',
    );
    expect(sanitiseText('topic abc', { NTFY_TOPIC: 'abc' })).toBe('topic abc');
  });
});

describe('sanitiseUrl', () => {
  it('keeps search params and drops tracking and session params and the fragment', () => {
    const url =
      'https://www.jet2holidays.com/beach/x?duration=7&occupancy=r2c4_1&airport=98&date=03-05-2027&sessionId=abc&gclid=z&utm_source=q#frag';
    const out = sanitiseUrl(url);
    expect(out).toBe(
      'https://www.jet2holidays.com/beach/x?duration=7&occupancy=r2c4_1&airport=98&date=03-05-2027',
    );
  });

  it('drops opaque 24+ char values under unknown param names', () => {
    expect(sanitiseUrl(`https://example.com/a?foo=${fakeOpaque()}&bar=1`)).toBe(
      'https://example.com/a?bar=1',
    );
  });

  it('removes the question mark when no params remain', () => {
    expect(sanitiseUrl('https://example.com/a?utm_source=x')).toBe('https://example.com/a');
  });

  it('sanitises URLs inside free text', () => {
    expect(sanitiseText('see https://example.com/a?sid=1&x=2, ok', noEnv)).toBe(
      'see https://example.com/a?x=2, ok',
    );
  });
});

describe('idempotence', () => {
  const inputs = [
    'contact jane.doe@example.com or 07700 900123, B26 3QJ',
    `jwt ${fakeJwt()} key ${fakeApiKey()} tok ${fakeOpaque()}`,
    'https://www.jet2holidays.com/beach/x?duration=7&sessionId=abc&utm_source=q#f',
    'Set-Cookie: sid=abc\nBHX 23:55 £1,299',
    '<div data-a="1" onclick="x()"><script>1</script><a href="/p?sid=1&amp;a=2">x</a>a@example.com</div>',
  ];

  it.each(inputs)('sanitiseText is idempotent for %#', (x) => {
    const once = sanitiseText(x, noEnv);
    expect(sanitiseText(once, noEnv)).toBe(once);
  });

  it.each(inputs)('sanitiseHtml is idempotent for %#', (x) => {
    const once = sanitiseHtml(x, noEnv);
    expect(sanitiseHtml(once, noEnv)).toBe(once);
  });
});
