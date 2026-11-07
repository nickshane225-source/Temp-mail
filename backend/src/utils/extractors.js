/**
 * Helper to extract verification codes (4-8 digits) and action/magic links from email text and HTML.
 */

// Decode Quoted-Printable (e.g. "=3D" -> "=", "=\r\n" -> "") if encoded
function decodeQuotedPrintable(str = '') {
  if (!str || (!str.includes('=3D') && !str.includes('=\r\n') && !str.includes('=\n'))) {
    return str;
  }
  return str
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

export function extractVerificationDetails(subject = '', text = '', html = '') {
  const codes = [];
  const links = [];

  const decodedHtml = decodeQuotedPrintable(html || '');
  const decodedText = decodeQuotedPrintable(text || '');

  // Strip script and style blocks
  const cleanHtml = decodedHtml
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  // Create a plain-text version of HTML with spacing
  const htmlAsPlainText = cleanHtml
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|td|h[1-6]|li|section|header|footer)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ');

  const searchPool = `${subject}\n${decodedText}\n${htmlAsPlainText}`;

  const IGNORED_WORDS = new Set([
    'HTTP', 'HTTPS', 'EMAIL', 'LOGIN', 'VERIFY', 'CHECK', 'CLICK',
    'PLEASE', 'SECURITY', 'ACCESS', 'ACCOUNT', 'PASSWORD', 'HTML'
  ]);

  // 1. Flexible contextual OTP / verification code patterns (Numeric & Alphanumeric)
  const contextualPatterns = [
    // Standard "code is 123456", "OTP: 123456", "Code: G-123456", "Code: AB729"
    /(?:verification|security|login|confirmation|auth|access|one[- ]time|secret|passcode)?\s*(?:code|otp|pin|passcode|token)\s*(?:is|:|-|=)?\s*[:\s#]*\b([A-Z0-9-]{4,10})\b/gi,
    // "123456 is your verification code"
    /\b([0-9]{4,8})\b\s*(?:is\s+your\s+(?:verification|security|confirmation|login|otp|pin|code))/gi,
    // "Enter 123456 to verify", "Use code 123456"
    /(?:enter|use|input|copy)\s+(?:the\s+)?(?:code\s+)?([A-Z0-9-]{4,10})\s+(?:to\s+(?:verify|confirm|login|sign in|authenticate)|as your)/gi,
    // "Verification code to complete your login: 123456"
    /(?:verification|confirmation|security|auth|one[- ]time|login)\s*(?:code|otp|pin|passcode)[^\d\n\r]{0,60}?\b([A-Z0-9-]{4,10})\b/gi,
    // Formats like G-123456 or X-123456
    /\b([A-Z]-[0-9]{4,8})\b/gi,
  ];

  for (const regex of contextualPatterns) {
    let m;
    while ((m = regex.exec(searchPool)) !== null) {
      const code = m[1]?.trim();
      if (
        code &&
        !codes.includes(code) &&
        /[0-9]/.test(code) &&
        !IGNORED_WORDS.has(code.toUpperCase()) &&
        code.length >= 4 &&
        code.length <= 10
      ) {
        codes.push(code);
      }
    }
  }

  // 2. Dashed or spaced codes: e.g. "123-456" or "123 456"
  const dashedRegex = /(?:verification|security|login|confirmation|auth|one[- ]time)?\s*(?:code|otp|pin|passcode)[^\d\n\r]{0,40}?\b([0-9]{3})[- ]([0-9]{3,4})\b/gi;
  let dm;
  while ((dm = dashedRegex.exec(searchPool)) !== null) {
    const combined = `${dm[1]}${dm[2]}`;
    if (!codes.includes(combined)) codes.push(combined);
  }

  // 3. Check subject specifically for 4-8 digit numbers
  const subjectCodeMatch = subject.match(/\b([0-9]{4,8})\b/);
  if (subjectCodeMatch && !codes.includes(subjectCodeMatch[1])) {
    codes.push(subjectCodeMatch[1]);
  }

  // 4. Check standalone styled blocks in HTML (divs, spans, headings, strong, td)
  const styledCodeRegex = /<(?:strong|b|h[1-6]|div|span|td|p|font)[^>]*class=["'][^"']*(?:code|otp|pin|token|verify)[^"']*["'][^>]*>\s*([0-9]{4,8})\s*<\/(?:strong|b|h[1-6]|div|span|td|p|font)>/gi;
  let styledMatch;
  while ((styledMatch = styledCodeRegex.exec(cleanHtml)) !== null) {
    const code = styledMatch[1];
    if (code && !codes.includes(code)) {
      codes.push(code);
    }
  }

  // 5. Large font or isolated 4-8 digit blocks in tags (strong, b, h1-h4, td, div, p)
  const isolatedTagRegex = /<(?:strong|b|h[1-4]|td)[^>]*>\s*([0-9]{4,8})\s*<\/(?:strong|b|h[1-4]|td)>/gi;
  let isoMatch;
  while ((isoMatch = isolatedTagRegex.exec(cleanHtml)) !== null) {
    const code = isoMatch[1];
    if (code && !codes.includes(code)) {
      codes.push(code);
    }
  }

  // 6. Extract verification & magic links from HTML <a> tags
  if (decodedHtml) {
    const linkRegex = /<a\s+(?:[^>]*?\s+)?href=(?:3D)?["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/a>/gi;
    const actionKeywords = [
      'verify', 'verification', 'confirm', 'confirmation', 'activate', 'activation',
      'login', 'log in', 'log-in', 'sign in', 'signin', 'sign-in',
      'magic', 'token', 'auth', 'authentication', 'callback', 'action', 'validate', 'validation',
      'get started', 'get-started', 'invitation', 'join', 'approve', 'access', 'continue', 'launch'
    ];

    let linkMatch;
    while ((linkMatch = linkRegex.exec(decodedHtml)) !== null) {
      let href = linkMatch[1].trim().replace(/^3D/i, '').replace(/&amp;/g, '&');
      const rawText = linkMatch[2].replace(/<[^>]*>/g, '').trim() || href;

      if (href.startsWith('http://') || href.startsWith('https://')) {
        const isAction = actionKeywords.some((k) =>
          rawText.toLowerCase().includes(k) || href.toLowerCase().includes(k)
        );

        if (isAction && !links.some((l) => l.url === href)) {
          links.push({
            url: href,
            text: rawText.replace(/\s+/g, ' ').slice(0, 60),
          });
        }
      }
    }
  }

  // 7. Also check for raw URLs in plain text containing verify/token/auth keywords
  if (decodedText && links.length === 0) {
    const rawUrlRegex = /(https?:\/\/[^\s<>"']+)/gi;
    let urlMatch;
    while ((urlMatch = rawUrlRegex.exec(decodedText)) !== null) {
      const url = urlMatch[1].replace(/&amp;/g, '&');
      if (/verify|confirm|token|auth|sign-in|login|activate|magic/i.test(url)) {
        if (!links.some((l) => l.url === url)) {
          links.push({ url, text: 'Open Verification Link' });
        }
      }
    }
  }

  return { codes, links };
}
