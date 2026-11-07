import { generateSecret, generateURI, verifySync } from 'otplib';
import crypto from 'crypto';

export function generateTotpSecret() {
  return generateSecret();
}

export function generateKeyUri(email, secret) {
  return generateURI({
    label: email,
    issuer: 'TempMail Admin',
    secret,
  });
}

export function verifyTotpToken(token, secret) {
  if (!token || !secret) return false;
  try {
    const cleanToken = String(token).trim();
    if (!/^\d{6}$/.test(cleanToken)) return false;
    const result = verifySync({ token: cleanToken, secret });
    return !!(result && result.valid);
  } catch {
    return false;
  }
}

export function generateBackupCodes(count = 8) {
  const plainCodes = [];
  const hashedCodes = [];

  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(4).toString('hex'); // 8 characters
    plainCodes.push(raw);
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    hashedCodes.push(hash);
  }

  return { plainCodes, hashedCodes };
}

export function verifyBackupCode(providedCode, hashedCodes = []) {
  if (!providedCode || !Array.isArray(hashedCodes)) return { valid: false, remaining: hashedCodes };
  const targetHash = crypto.createHash('sha256').update(String(providedCode).trim()).digest('hex');
  const index = hashedCodes.indexOf(targetHash);
  if (index !== -1) {
    const remaining = hashedCodes.filter((_, idx) => idx !== index);
    return { valid: true, remaining };
  }
  return { valid: false, remaining: hashedCodes };
}
