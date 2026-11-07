/**
 * Spam score calculation and Phishing detection helper (Item 19 & Phase 1 Security)
 * Computes spam score and detects lookalike domains, brand impersonation, and deceptive headers.
 */

const SUSPICIOUS_WORDS = [
  'lottery', 'winner', 'million dollar', 'claim prize', 'urgent response',
  'wire transfer', 'crypto investment', 'bitcoin transfer', 'inheritance',
  'beneficiary', 'viagra', 'cialis', 'bank account suspended', 'verify identity immediately',
  'make money fast', 'earn thousands', 'western union', 'confidential proposal'
];

const TARGETED_BRANDS = [
  { name: 'PayPal', domain: 'paypal.com', lookalikes: [/paypa[l1i]/i, /p[a4]yp[a4]l/i] },
  { name: 'Google', domain: 'google.com', lookalikes: [/g[o0][o0]gle/i, /goog[l1]e/i] },
  { name: 'Apple', domain: 'apple.com', lookalikes: [/app[l1i]e/i, /[a4]pple/i] },
  { name: 'Microsoft', domain: 'microsoft.com', lookalikes: [/micr[o0]s[o0]ft/i] },
  { name: 'Amazon', domain: 'amazon.com', lookalikes: [/amaz[o0]n/i, /[a4]m[a4]z[o0]n/i] },
  { name: 'Netflix', domain: 'netflix.com', lookalikes: [/netf[l1i]x/i] },
  { name: 'Binance', domain: 'binance.com', lookalikes: [/bin[a4]nce/i] },
  { name: 'Coinbase', domain: 'coinbase.com', lookalikes: [/c[o0]inb[a4]se/i] },
  { name: 'Facebook', domain: 'facebook.com', lookalikes: [/faceb[o0][o0]k/i] },
  { name: 'Instagram', domain: 'instagram.com', lookalikes: [/inst[a4]gr[a4]m/i] },
  { name: 'Stripe', domain: 'stripe.com', lookalikes: [/str[i1l]pe/i] },
];

/**
 * Detects deceptive sender domains, brand spoofing, and lookalike homoglyphs.
 */
export function detectPhishing({ from = '', subject = '', html = '', text = '' } = {}) {
  let displayName = '';
  let emailAddr = from;
  const match = from.match(/^["']?([^"<']+)["']?\s*<([^>]+)>/);
  if (match) {
    displayName = match[1].trim();
    emailAddr = match[2].trim();
  }
  const fromDomain = (emailAddr.includes('@') ? emailAddr.split('@')[1] : '').toLowerCase().trim();

  // 1. Check for brand display name impersonation
  for (const brand of TARGETED_BRANDS) {
    const nameRegex = new RegExp(`\\b${brand.name}\\b`, 'i');
    if (nameRegex.test(displayName)) {
      const isLegitDomain = fromDomain === brand.domain || fromDomain.endsWith('.' + brand.domain);
      if (!isLegitDomain) {
        return {
          isSuspicious: true,
          type: 'brand_impersonation',
          claimedBrand: brand.name,
          actualDomain: fromDomain,
          reason: `Sender display name claims to be "${brand.name}", but the actual sending domain is "${fromDomain}".`,
        };
      }
    }
  }

  // 2. Check for lookalike domain typosquatting / homoglyphs
  for (const brand of TARGETED_BRANDS) {
    for (const regex of brand.lookalikes) {
      if (regex.test(fromDomain) && fromDomain !== brand.domain && !fromDomain.endsWith('.' + brand.domain)) {
        return {
          isSuspicious: true,
          type: 'lookalike_domain',
          claimedBrand: brand.name,
          actualDomain: fromDomain,
          reason: `The sending domain "${fromDomain}" resembles "${brand.domain}" and may be a deceptive lookalike.`,
        };
      }
    }
  }

  // 3. Check for suspicious subdomain spoofing (e.g. paypal.com.attacker.xyz)
  for (const brand of TARGETED_BRANDS) {
    if (fromDomain.startsWith(brand.domain + '.') || fromDomain.includes('.' + brand.domain + '.')) {
      return {
        isSuspicious: true,
        type: 'domain_spoofing',
        claimedBrand: brand.name,
        actualDomain: fromDomain,
        reason: `The sending domain "${fromDomain}" uses a misleading subdomain structure to impersonate "${brand.domain}".`,
      };
    }
  }

  return null;
}

export function calculateSpamScore({ subject = '', text = '', html = '', from = '', replyTo = '' } = {}) {
  let score = 0;
  const combined = `${subject} ${text} ${html}`.toLowerCase();

  // Phishing detection
  const phishing = detectPhishing({ from, subject, html, text });
  if (phishing) {
    score += 50; // Heavy penalty for phishing lookalike / impersonation
  }

  // 1. Keyword check (+20 per matched category, max 50)
  let keywordHits = 0;
  for (const word of SUSPICIOUS_WORDS) {
    if (combined.includes(word)) {
      keywordHits++;
      score += 20;
      if (score >= 50) break;
    }
  }

  // 2. Link count check: more than 5 links in HTML -> +25 points
  const linkMatches = (html || '').match(/<a\s+[^>]*href=["'][^"']+["']/gi);
  const linkCount = linkMatches ? linkMatches.length : 0;
  if (linkCount > 5) {
    score += 25;
  }

  // 3. Mismatched From vs Reply-To domain -> +25 points
  if (from && replyTo) {
    const fromDomain = from.split('@')[1]?.toLowerCase().trim();
    const replyDomain = replyTo.split('@')[1]?.toLowerCase().trim();
    if (fromDomain && replyDomain && fromDomain !== replyDomain) {
      score += 25;
    }
  }

  // 4. Excessive capitalization in subject -> +15 points
  const letters = subject.replace(/[^a-zA-Z]/g, '');
  if (letters.length > 8) {
    const uppers = letters.replace(/[^A-Z]/g, '');
    if (uppers.length / letters.length > 0.6) {
      score += 15;
    }
  }

  const finalScore = Math.min(100, Math.max(0, score));
  return {
    score: finalScore,
    isSpam: finalScore >= 50,
    phishingWarning: phishing,
  };
}
