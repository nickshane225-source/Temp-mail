/**
 * Sanitizes and validates internal redirect paths.
 * Rejects absolute URLs, protocol-relative URLs (//evil.com),
 * javascript:, data:, and off-origin targets.
 */
export function getSafeRedirect(target, defaultFallback = '/account') {
  if (!target || typeof target !== 'string') return defaultFallback;

  const trimmed = target.trim();
  // Must start with exactly one '/' and not '//'
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return defaultFallback;
  }

  // Must not contain control characters, newlines, or colon-slashes
  if (/[\r\n\t]/.test(trimmed) || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return defaultFallback;
  }

  try {
    const url = new URL(trimmed, 'https://tempmail.internal');
    // Ensure origin matches the dummy internal origin
    if (url.origin !== 'https://tempmail.internal') {
      return defaultFallback;
    }
    return url.pathname + url.search + url.hash;
  } catch {
    return defaultFallback;
  }
}
