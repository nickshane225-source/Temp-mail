/**
 * Link safety analyzer (Item 26)
 * Detects IP address links, punycode/IDN lookalike domains, URL shorteners, and text mismatches.
 */

const KNOWN_SHORTENERS = [
  'bit.ly', 'tinyurl.com', 't.co', 'ow.ly', 'is.gd', 'buff.ly',
  'cutt.ly', 'goo.gl', 'rebrand.ly', 'shorturl.at', 'rb.gy'
];

export function analyzeLinkSafety(url, linkText = '') {
  const warnings = [];
  let destinationDomain = '';
  let isHighRisk = false;

  try {
    const parsed = new URL(url);
    destinationDomain = parsed.hostname.toLowerCase();

    // 1. IP address check (IPv4 or IPv6)
    const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(destinationDomain) || destinationDomain.startsWith('[');
    if (isIp) {
      warnings.push({
        type: 'ip',
        level: 'danger',
        message: 'This link leads directly to a raw numerical IP address instead of a recognized domain name.',
      });
      isHighRisk = true;
    }

    // 2. Punycode / IDN lookalike domain
    if (destinationDomain.startsWith('xn--') || /[^\u0000-\u007F]/.test(destinationDomain)) {
      warnings.push({
        type: 'punycode',
        level: 'danger',
        message: 'Lookalike domain (IDN / Punycode) detected. Attackers use visually identical characters to impersonate legitimate brands.',
      });
      isHighRisk = true;
    }

    // 3. Known URL shortener
    if (KNOWN_SHORTENERS.includes(destinationDomain)) {
      warnings.push({
        type: 'shortener',
        level: 'warning',
        message: 'This link uses a URL shortener service, which conceals the real final destination.',
      });
    }

    // 4. Mismatched anchor text vs actual destination
    if (linkText) {
      const cleanText = linkText.toLowerCase().trim();
      const domainInText = cleanText.match(/\b([a-z0-9-]+\.[a-z]{2,})\b/i);
      if (domainInText && domainInText[1]) {
        const textDomain = domainInText[1].toLowerCase();
        if (textDomain !== destinationDomain && !destinationDomain.endsWith('.' + textDomain)) {
          warnings.push({
            type: 'mismatch',
            level: 'danger',
            message: `Deceptive link: The visible text displays "${textDomain}" but the link points to "${destinationDomain}".`,
          });
          isHighRisk = true;
        }
      }
    }
  } catch {
    warnings.push({
      type: 'invalid',
      level: 'danger',
      message: 'The URL structure is malformed or invalid.',
    });
    isHighRisk = true;
  }

  return {
    destinationDomain,
    warnings,
    isHighRisk,
  };
}

/**
 * Rewrites all links inside HTML so they navigate through the in-app confirmation page
 */
export function rewriteHtmlLinks(html) {
  if (!html) return '';

  return html.replace(/<a\s+(?:[^>]*?\s+)?href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi, (match, href, restAttrs, text) => {
    // Keep mailto or anchor links untouched
    if (href.startsWith('mailto:') || href.startsWith('#')) {
      return match;
    }

    const trimmedHref = href.trim();
    if (!trimmedHref.startsWith('http://') && !trimmedHref.startsWith('https://')) {
      return match;
    }

    let destDomain = '';
    try {
      destDomain = new URL(trimmedHref).hostname;
    } catch {}

    const safeUrl = `/confirm-link?url=${encodeURIComponent(trimmedHref)}`;
    const domainBadge = destDomain ? ` <span style="font-size:11px;opacity:0.75;font-family:monospace;background:#e2e8f0;color:#334155;padding:1px 4px;border-radius:4px;">(${destDomain})</span>` : '';

    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer nofollow"${restAttrs}>${text}</a>${domainBadge}`;
  });
}
