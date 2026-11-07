import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import app from './app.js';
import { Domain, Admin } from './models.js';
import { startSmtp } from './smtp.js';
import { startGridFSCleanupJob, startAutoCleanupJob } from './cleanup.js';
import { checkAllDomainsHealth } from './utils/domainHealth.js';

if (!process.env.MONGO_URI || !process.env.MONGO_URI.trim()) {
  console.error('FATAL: MONGO_URI environment variable is missing.');
  process.exit(1);
}

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET environment variable is missing or shorter than 32 characters.');
  process.exit(1);
}

if (!process.env.INBOUND_SECRET || !process.env.INBOUND_SECRET.trim()) {
  console.warn('WARNING: INBOUND_SECRET is missing or empty. The Cloudflare route (/api/inbound) is disabled.');
}

await mongoose.connect(process.env.MONGO_URI);

// Ensure at least one active domain exists in database so mailbox creation never fails
const activeDomainCount = await Domain.countDocuments({ active: true });
if (activeDomainCount === 0) {
  const defaultDomain = (process.env.DEFAULT_DOMAIN || 'tempmail.com').toLowerCase().trim();
  await Domain.updateOne(
    { name: defaultDomain },
    { $setOnInsert: { name: defaultDomain, active: true } },
    { upsert: true }
  );
  console.log(`Auto-seeded active domain: ${defaultDomain}`);
}

// Ensure initial admin exists in database so the admin dashboard is immediately accessible
const adminCount = await Admin.countDocuments();
if (adminCount === 0) {
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@tempmail.com').toLowerCase().trim();
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123456';
  const hashedPassword = await bcrypt.hash(adminPassword, 12);
  await Admin.create({
    email: adminEmail,
    password: hashedPassword,
    role: 'owner',
  });
  console.log(`Auto-seeded initial admin account: ${adminEmail}`);
}

startGridFSCleanupJob();
startAutoCleanupJob();
setInterval(checkAllDomainsHealth, 24 * 60 * 60 * 1000);
await startSmtp(Number(process.env.SMTP_PORT || 2525));
app.listen(process.env.PORT || 4000, () => console.log(`Web + API on :${process.env.PORT || 4000}`));
