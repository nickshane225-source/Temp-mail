import { Blocklist } from '../models.js';

/**
 * Checks if incoming email matches any blocked sender domain, address, or client IP.
 */
export async function isSenderBlocked({ from = '', ip = '' } = {}) {
  const cleanFrom = String(from).toLowerCase().trim();
  const cleanIp = String(ip || '').trim();
  const senderDomain = cleanFrom.includes('@') ? cleanFrom.split('@')[1] : '';

  const queries = [];
  if (cleanFrom) queries.push({ type: 'address', value: cleanFrom });
  if (senderDomain) queries.push({ type: 'domain', value: senderDomain });
  if (cleanIp) queries.push({ type: 'ip', value: cleanIp });

  if (queries.length === 0) return null;

  const match = await Blocklist.findOne({ $or: queries }).lean();
  return match;
}
