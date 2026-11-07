import dns from 'dns';
import { Domain, getSettings } from '../models.js';

export async function checkDomainHealth(domainDoc) {
  const domain = typeof domainDoc === 'string'
    ? await Domain.findOne({ name: domainDoc.toLowerCase() })
    : domainDoc;

  if (!domain) return null;

  const expectedMx = process.env.EXPECTED_MX ? process.env.EXPECTED_MX.toLowerCase().trim() : '';
  const now = new Date();

  try {
    const dnsPromise = dns.promises.resolveMx(domain.name);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('DNS lookup timed out')), 5000)
    );
    const mxRecords = await Promise.race([dnsPromise, timeoutPromise]);
    if (!mxRecords || mxRecords.length === 0) {
      domain.status = 'Failing';
      domain.statusReason = 'No MX records found for domain.';
    } else {
      const topMx = mxRecords[0].exchange.toLowerCase();
      if (expectedMx) {
        const matches = mxRecords.some((r) => r.exchange.toLowerCase().includes(expectedMx));
        if (matches) {
          domain.status = 'Healthy';
          domain.statusReason = `MX points to expected target (${topMx}).`;
        } else {
          domain.status = 'Warning';
          domain.statusReason = `MX points to ${topMx} (expected ${expectedMx}).`;
        }
      } else {
        domain.status = 'Healthy';
        domain.statusReason = `Active MX records verified (${topMx}).`;
      }
    }
  } catch (err) {
    domain.status = 'Failing';
    domain.statusReason = err.code === 'ENODATA' ? 'Domain has no MX records.' : (err.message || 'DNS resolution failed.');
  }

  domain.lastCheckedAt = now;

  const { autoPauseFailingDomains } = await getSettings();
  if (autoPauseFailingDomains && domain.status === 'Failing') {
    domain.active = false;
  }

  await domain.save();
  return domain;
}

export async function checkAllDomainsHealth() {
  const domains = await Domain.find({});
  for (const d of domains) {
    try {
      await checkDomainHealth(d);
    } catch {}
  }
}
