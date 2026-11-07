import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import {
  Admin,
  Domain,
  Mailbox,
  Message,
  Stat,
  Setting,
  User,
  Payment,
  WebhookLog,
  Post,
  Blocklist,
  Report,
  AuditLog,
  Failure,
  getSettings,
} from '../models.js';
import { checkDomainHealth } from '../utils/domainHealth.js';
import {
  generateTotpSecret,
  generateKeyUri,
  verifyTotpToken,
  generateBackupCodes,
  verifyBackupCode,
} from '../utils/totp.js';
import { verifyFirebaseIdToken } from '../utils/firebase.js';
import { cleanupOldData } from '../cleanup.js';

const r = Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 10,
  message: { error: 'Too many attempts. Try again later.' },
});

// Helper to record audit logs
async function logAudit(req, action, details = {}) {
  try {
    await AuditLog.create({
      adminId: req.adminId,
      adminEmail: req.adminEmail,
      action,
      details,
      ip: req.headers['cf-connecting-ip'] || req.ip,
    });
  } catch {}
}

// ----------------------------------------------------
// 1. Admin Authentication & 2FA (Items 20, 21)
// ----------------------------------------------------
r.post('/login', loginLimiter, async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  const password = String(req.body?.password || '');
  const a = await Admin.findOne({ email });

  if (!a || !(await bcrypt.compare(password, a.password))) {
    return res.status(401).json({ error: 'Wrong email or password.' });
  }

  if (a.disabled) {
    return res.status(403).json({ error: 'This admin account has been disabled.' });
  }

  // TOTP 2FA Verification
  if (a.totpEnabled) {
    const code = req.body?.totpCode || req.body?.backupCode;
    if (!code) {
      return res.json({ require2fa: true });
    }

    const isTotpValid = verifyTotpToken(code, a.totpSecret);
    let isBackupValid = false;

    if (!isTotpValid && a.backupCodes?.length) {
      const backupCheck = verifyBackupCode(code, a.backupCodes);
      if (backupCheck.valid) {
        isBackupValid = true;
        a.backupCodes = backupCheck.remaining;
        await a.save();
      }
    }

    if (!isTotpValid && !isBackupValid) {
      return res.status(401).json({ error: 'Invalid 2FA authentication code or backup code.' });
    }
  }

  const token = jwt.sign(
    { id: a._id, email: a.email, role: a.role || 'owner' },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );

  // Record audit log
  await AuditLog.create({
    adminId: a._id,
    adminEmail: a.email,
    action: 'login',
    details: { totpUsed: !!a.totpEnabled },
    ip: req.headers['cf-connecting-ip'] || req.ip,
  });

  res.json({
    token,
    admin: {
      email: a.email,
      role: a.role || 'owner',
      totpEnabled: !!a.totpEnabled,
    },
  });
});

// Admin Google / Firebase Authentication
r.post('/firebase', loginLimiter, async (req, res) => {
  const { idToken } = req.body || {};
  if (!idToken) {
    return res.status(400).json({ error: 'Firebase ID token is required.' });
  }

  try {
    const verified = await verifyFirebaseIdToken(idToken);
    if (!verified.email) {
      return res.status(400).json({ error: 'Firebase token did not contain an email.' });
    }

    const cleanEmail = verified.email.toLowerCase().trim();
    let a = await Admin.findOne({ email: cleanEmail });

    // Bootstrap if matching configured ADMIN_EMAIL env var
    const defaultEmail = (process.env.ADMIN_EMAIL || 'admin@tempmail.com').toLowerCase().trim();
    if (!a && cleanEmail === defaultEmail) {
      const defaultPass = process.env.ADMIN_PASSWORD || 'admin123456';
      const hashedPassword = await bcrypt.hash(defaultPass, 12);
      a = await Admin.create({
        email: cleanEmail,
        password: hashedPassword,
        role: 'owner',
      });
    }

    if (!a) {
      return res.status(403).json({
        error: `Access denied. Google account "${cleanEmail}" is not an authorized administrator. Add this email in Admin Users or set ADMIN_EMAIL.`,
      });
    }

    if (a.disabled) {
      return res.status(403).json({ error: 'This admin account has been disabled.' });
    }

    const token = jwt.sign(
      { id: a._id, email: a.email, role: a.role || 'owner' },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    await AuditLog.create({
      adminId: a._id,
      adminEmail: a.email,
      action: 'login',
      details: { method: 'firebase_google' },
      ip: req.headers['cf-connecting-ip'] || req.ip,
    });

    res.json({
      token,
      admin: {
        email: a.email,
        role: a.role || 'owner',
        totpEnabled: !!a.totpEnabled,
      },
    });
  } catch (err) {
    res.status(401).json({ error: err.message || 'Firebase admin authentication failed.' });
  }
});

// Middleware: Authenticate Admin & attach permissions
r.use(async (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-change-me');
    const admin = await Admin.findById(decoded.id);
    if (!admin || admin.disabled) {
      return res.status(401).json({ error: 'Admin session invalid or account disabled' });
    }
    req.admin = admin;
    req.adminId = admin._id;
    req.adminEmail = admin.email;
    req.adminRole = admin.role || 'owner';

    // Role Guard: Read-only role cannot mutate state
    if (req.adminRole === 'read_only' && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return res.status(403).json({ error: 'Permission denied. Read-only role cannot perform modifications.' });
    }

    // Role Guard: Billing-only role can only access payments, users, and profile
    if (req.adminRole === 'billing_only' && !req.path.startsWith('/payments') && !req.path.startsWith('/users') && req.path !== '/me') {
      return res.status(403).json({ error: 'Permission denied. Billing-only role can only access payments and billing.' });
    }

    next();
  } catch {
    res.status(401).json({ error: 'Please sign in again.' });
  }
});

// Role Guard: Owner only middleware
function requireOwner(req, res, next) {
  if (req.adminRole !== 'owner') {
    return res.status(403).json({ error: 'Permission denied. Requires Owner role.' });
  }
  next();
}

// ----------------------------------------------------
// 2. Current Admin Profile & Security (Item 21)
// ----------------------------------------------------
r.get('/me', (req, res) => {
  res.json({
    email: req.admin.email,
    role: req.adminRole,
    totpEnabled: !!req.admin.totpEnabled,
  });
});

r.post('/change-password', async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  }

  const valid = await bcrypt.compare(String(currentPassword), req.admin.password);
  if (!valid) return res.status(400).json({ error: 'Current password is incorrect.' });

  req.admin.password = await bcrypt.hash(String(newPassword), 12);
  await req.admin.save();
  await logAudit(req, 'change_password');

  res.json({ ok: true, message: 'Password updated successfully.' });
});

// Setup 2FA (returns secret and otpauth URI)
r.post('/2fa/setup', (req, res) => {
  const secret = generateTotpSecret();
  const uri = generateKeyUri(req.adminEmail, secret);
  res.json({ secret, uri });
});

// Enable 2FA (verifies first token and generates backup codes)
r.post('/2fa/enable', async (req, res) => {
  const { secret, token } = req.body || {};
  if (!verifyTotpToken(token, secret)) {
    return res.status(400).json({ error: 'Invalid 6-digit TOTP verification code.' });
  }

  const { plainCodes, hashedCodes } = generateBackupCodes(8);
  req.admin.totpSecret = secret;
  req.admin.totpEnabled = true;
  req.admin.backupCodes = hashedCodes;
  await req.admin.save();

  await logAudit(req, 'enable_2fa');

  res.json({
    ok: true,
    message: '2FA enabled successfully.',
    backupCodes: plainCodes,
  });
});

// Disable 2FA
r.post('/2fa/disable', async (req, res) => {
  const { password, token } = req.body || {};
  const validPass = await bcrypt.compare(String(password || ''), req.admin.password);
  if (!validPass) return res.status(400).json({ error: 'Current password is required to disable 2FA.' });

  const validTotp = verifyTotpToken(token, req.admin.totpSecret);
  if (!validTotp) return res.status(400).json({ error: 'Invalid TOTP code.' });

  req.admin.totpEnabled = false;
  req.admin.totpSecret = undefined;
  req.admin.backupCodes = [];
  await req.admin.save();

  await logAudit(req, 'disable_2fa');

  res.json({ ok: true, message: '2FA has been disabled.' });
});

// ----------------------------------------------------
// 3. Admin Accounts Management (Item 20, Owner only)
// ----------------------------------------------------
r.get('/admins', requireOwner, async (_req, res) => {
  const admins = await Admin.find().select('email role disabled totpEnabled createdAt').lean();
  res.json(admins);
});

r.post('/admins', requireOwner, async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  const password = String(req.body?.password || '');
  const role = req.body?.role === 'moderator' ? 'moderator' : 'owner';

  if (!email || !password || password.length < 8) {
    return res.status(400).json({ error: 'Valid email and a password of at least 8 characters are required.' });
  }

  const existing = await Admin.findOne({ email });
  if (existing) return res.status(409).json({ error: 'An admin with that email already exists.' });

  const hashedPassword = await bcrypt.hash(password, 12);
  const created = await Admin.create({ email, password: hashedPassword, role });
  await logAudit(req, 'create_admin', { email, role });

  res.json({
    _id: created._id,
    email: created.email,
    role: created.role,
    disabled: created.disabled,
  });
});

r.patch('/admins/:id', requireOwner, async (req, res) => {
  if (String(req.adminId) === String(req.params.id)) {
    return res.status(400).json({ error: 'You cannot disable or demote your own account.' });
  }

  const update = {};
  if (req.body?.role !== undefined) update.role = req.body.role === 'moderator' ? 'moderator' : 'owner';
  if (req.body?.disabled !== undefined) update.disabled = !!req.body.disabled;

  const updated = await Admin.findByIdAndUpdate(req.params.id, update, { new: true }).select('email role disabled totpEnabled');
  if (!updated) return res.status(404).json({ error: 'Admin not found.' });

  await logAudit(req, 'update_admin', { target: updated.email, update });
  res.json(updated);
});

r.delete('/admins/:id', requireOwner, async (req, res) => {
  if (String(req.adminId) === String(req.params.id)) {
    return res.status(400).json({ error: 'You cannot delete your own account.' });
  }

  const deleted = await Admin.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Admin not found.' });

  await logAudit(req, 'delete_admin', { email: deleted.email });
  res.json({ ok: true });
});

// Audit Logs (Item 20)
r.get('/audit-logs', async (_req, res) => {
  const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(100).lean();
  res.json(logs);
});

// ----------------------------------------------------
// 4. Analytics & Operational Metrics (Item 18)
// ----------------------------------------------------
r.get('/analytics', async (_req, res) => {
  const days = [...Array(30)].map((_, i) => new Date(Date.now() - (29 - i) * 864e5).toISOString().slice(0, 10));
  const stats = await Stat.find({ day: { $in: days } }).lean();
  const statMap = Object.fromEntries(stats.map((s) => [s.day, s]));

  // Daily growth timeline
  const timeline = days.map((d) => ({
    day: d,
    received: statMap[d]?.received || 0,
    mailboxes: statMap[d]?.mailboxes || 0,
  }));

  // Aggregated hours (0..23)
  const hours = new Array(24).fill(0);
  // Aggregated top sender domains
  const domainCounts = {};
  // Aggregated countries
  const countryCounts = {};

  stats.forEach((s) => {
    if (Array.isArray(s.hours)) {
      s.hours.forEach((count, h) => {
        hours[h] = (hours[h] || 0) + (count || 0);
      });
    }
    if (s.senderDomains) {
      const obj = s.senderDomains instanceof Map ? Object.fromEntries(s.senderDomains) : s.senderDomains;
      Object.entries(obj).forEach(([dom, cnt]) => {
        domainCounts[dom] = (domainCounts[dom] || 0) + cnt;
      });
    }
    if (s.countries) {
      const obj = s.countries instanceof Map ? Object.fromEntries(s.countries) : s.countries;
      Object.entries(obj).forEach(([c, cnt]) => {
        countryCounts[c] = (countryCounts[c] || 0) + cnt;
      });
    }
  });

  const topSenders = Object.entries(domainCounts)
    .map(([domain, count]) => ({ domain: domain.replace(/_/g, '.'), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const topCountries = Object.entries(countryCounts)
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  res.json({
    timeline,
    hours,
    topSenders,
    topCountries,
  });
});

// Overview Quick Stats
r.get('/stats', async (_q, res) => {
  const days = [...Array(7)].map((_, i) => new Date(Date.now() - (6 - i) * 864e5).toISOString().slice(0, 10));
  const [activeMailboxes, messagesStored, domains, stats, total, failures24h] = await Promise.all([
    Mailbox.countDocuments(),
    Message.countDocuments(),
    Domain.countDocuments({ active: true }),
    Stat.find({ day: { $in: days } }).lean(),
    Stat.aggregate([{ $group: { _id: null, n: { $sum: '$received' } } }]),
    Failure.countDocuments({ createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
  ]);
  const map = Object.fromEntries(stats.map((s) => [s.day, s]));
  res.json({
    activeMailboxes,
    messagesStored,
    domains,
    totalReceived: total[0]?.n || 0,
    failures24h,
    days: days.map((d) => ({
      day: d,
      received: map[d]?.received || 0,
      mailboxes: map[d]?.mailboxes || 0,
    })),
  });
});

// Analytics Date Range Picker with Period Comparison
r.get('/analytics/range', async (req, res) => {
  const startStr = req.query.start || new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
  const endStr = req.query.end || new Date().toISOString().slice(0, 10);
  const compare = req.query.compare === 'true';

  const stats = await Stat.find({ day: { $gte: startStr, $lte: endStr } }).sort({ day: 1 }).lean();
  const currentReceived = stats.reduce((acc, s) => acc + (s.received || 0), 0);
  const currentMailboxes = stats.reduce((acc, s) => acc + (s.mailboxes || 0), 0);

  const dailySeries = stats.map((s) => ({
    day: s.day,
    received: s.received || 0,
    mailboxes: s.mailboxes || 0,
  }));

  // Aggregated domain counts
  const domainCounts = {};
  stats.forEach((s) => {
    if (s.senderDomains) {
      const obj = s.senderDomains instanceof Map ? Object.fromEntries(s.senderDomains) : s.senderDomains;
      Object.entries(obj).forEach(([d, c]) => {
        domainCounts[d] = (domainCounts[d] || 0) + c;
      });
    }
  });

  const topSenders = Object.entries(domainCounts)
    .map(([domain, count]) => ({ domain: domain.replace(/_/g, '.'), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  let previous = null;
  let changePercent = { received: 0, mailboxes: 0 };

  if (compare) {
    const startDate = new Date(startStr);
    const endDate = new Date(endStr);
    const diffMs = Math.max(864e5, endDate.getTime() - startDate.getTime());
    const prevEndStr = new Date(startDate.getTime() - 864e5).toISOString().slice(0, 10);
    const prevStartStr = new Date(startDate.getTime() - 864e5 - diffMs).toISOString().slice(0, 10);

    const prevStats = await Stat.find({ day: { $gte: prevStartStr, $lte: prevEndStr } }).lean();
    const prevReceived = prevStats.reduce((acc, s) => acc + (s.received || 0), 0);
    const prevMailboxes = prevStats.reduce((acc, s) => acc + (s.mailboxes || 0), 0);

    previous = {
      received: prevReceived,
      mailboxes: prevMailboxes,
      start: prevStartStr,
      end: prevEndStr,
    };

    changePercent = {
      received: prevReceived > 0 ? Number((((currentReceived - prevReceived) / prevReceived) * 100).toFixed(1)) : 0,
      mailboxes: prevMailboxes > 0 ? Number((((currentMailboxes - prevMailboxes) / prevMailboxes) * 100).toFixed(1)) : 0,
    };
  }

  res.json({
    current: {
      received: currentReceived,
      mailboxes: currentMailboxes,
      start: startStr,
      end: endStr,
    },
    previous,
    changePercent,
    dailySeries,
    topSenders,
  });
});

// System Health Diagnostics
r.get('/health', async (_req, res) => {
  const startTime = Date.now();
  let mongoConnected = false;
  let pingMs = 0;

  try {
    const mongoose = (await import('mongoose')).default;
    if (mongoose.connection?.readyState === 1) {
      await mongoose.connection.db.admin().ping();
      mongoConnected = true;
      pingMs = Date.now() - startTime;
    }
  } catch {
    mongoConnected = false;
  }

  const [messageCount, mailboxCount, failureCount24h] = await Promise.all([
    Message.countDocuments().catch(() => 0),
    Mailbox.countDocuments().catch(() => 0),
    Failure.countDocuments({ createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }).catch(() => 0),
  ]);

  const status = mongoConnected ? (failureCount24h > 50 ? 'degraded' : 'healthy') : 'failing';

  res.json({
    status,
    mongodb: {
      connected: mongoConnected,
      pingMs,
    },
    smtp: {
      listening: true,
      port: Number(process.env.SMTP_PORT || 25),
    },
    storage: {
      messageCount,
      mailboxCount,
      failureCount24h,
    },
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Live incoming message metadata SSE stream
r.get('/messages/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  res.write(`data: ${JSON.stringify({ type: 'connected', time: new Date().toISOString() })}\n\n`);

  const keepAlive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 20000);

  req.on('close', () => {
    clearInterval(keepAlive);
  });
});

// ----------------------------------------------------
// 5. Abuse Blocklist & Reports (Item 19)
// ----------------------------------------------------
r.get('/blocklist/export', async (_req, res) => {
  const list = await Blocklist.find().sort({ createdAt: -1 }).lean();
  const headers = ['Type', 'Value', 'Reason', 'IsWildcard', 'HitCount', 'CreatedAt'];
  const rows = list.map((b) => [
    b.type,
    `"${(b.value || '').replace(/"/g, '""')}"`,
    `"${(b.reason || '').replace(/"/g, '""')}"`,
    b.isWildcard ? 'true' : 'false',
    b.hitCount || 0,
    b.createdAt ? new Date(b.createdAt).toISOString() : '',
  ].join(','));

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="blocklist-export.csv"');
  res.send([headers.join(','), ...rows].join('\n'));
});

r.post('/blocklist/bulk', async (req, res) => {
  const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
  if (!entries.length) return res.status(400).json({ error: 'entries array is required.' });

  let insertedCount = 0;
  for (const item of entries) {
    if (item.type && item.value) {
      const cleanVal = String(item.value).toLowerCase().trim();
      await Blocklist.updateOne(
        { type: item.type, value: cleanVal },
        {
          type: item.type,
          value: cleanVal,
          reason: item.reason || '',
          isWildcard: !!item.isWildcard || cleanVal.includes('*'),
        },
        { upsert: true }
      );
      insertedCount++;
    }
  }

  await logAudit(req, 'bulk_add_blocklist', { count: insertedCount });
  res.json({ ok: true, insertedCount });
});

r.get('/blocklist', async (_req, res) => {
  res.json(await Blocklist.find().sort({ createdAt: -1 }).lean());
});

r.post('/blocklist', async (req, res) => {
  const { type, value, reason } = req.body || {};
  if (!['domain', 'address', 'ip'].includes(type) || !value) {
    return res.status(400).json({ error: 'Valid type (domain, address, ip) and value are required.' });
  }

  const cleanVal = String(value).toLowerCase().trim();
  try {
    const entry = await Blocklist.create({ type, value: cleanVal, reason: String(reason || '').trim() });
    await logAudit(req, 'add_blocklist', { type, value: cleanVal });
    res.json(entry);
  } catch {
    res.status(409).json({ error: 'This value is already blocked.' });
  }
});

r.delete('/blocklist/:id', async (req, res) => {
  await Blocklist.findByIdAndDelete(req.params.id);
  await logAudit(req, 'remove_blocklist', { id: req.params.id });
  res.json({ ok: true });
});

// Message Reports (Item 19)
r.get('/reports/grouped', async (_req, res) => {
  const grouped = await Report.aggregate([
    {
      $group: {
        _id: '$from',
        count: { $sum: 1 },
        subjects: { $addToSet: '$subject' },
        reasons: { $addToSet: '$reason' },
        addresses: { $addToSet: '$address' },
        lastReportedAt: { $max: '$createdAt' },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 100 },
  ]);

  res.json(grouped);
});

r.get('/reports', async (_req, res) => {
  res.json(await Report.find().sort({ createdAt: -1 }).limit(100).lean());
});

r.post('/reports/:id/dismiss', async (req, res) => {
  await Report.findByIdAndUpdate(req.params.id, { resolved: true });
  res.json({ ok: true });
});

r.post('/reports/:id/block', async (req, res) => {
  const report = await Report.findById(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });

  const type = req.body?.type === 'domain' ? 'domain' : 'address';
  let value = report.from?.toLowerCase().trim();
  if (type === 'domain' && value.includes('@')) {
    value = value.split('@')[1];
  }

  if (value) {
    await Blocklist.updateOne(
      { type, value },
      { type, value, reason: `Blocked via abuse report (${report.reason})` },
      { upsert: true }
    );
  }

  report.resolved = true;
  await report.save();
  await logAudit(req, 'block_reported_sender', { reportId: report._id, type, value });

  res.json({ ok: true, blocked: { type, value } });
});

// ----------------------------------------------------
// 6. Monitoring & Failures (Item 22)
// ----------------------------------------------------
r.get('/failures', async (_req, res) => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [failures, count24h] = await Promise.all([
    Failure.find({ createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(100).lean(),
    Failure.countDocuments({ createdAt: { $gte: since } }),
  ]);

  res.json({
    failures,
    count24h,
    thresholdExceeded: count24h >= 10,
  });
});

r.delete('/failures', async (req, res) => {
  await Failure.deleteMany({});
  await logAudit(req, 'clear_failures');
  res.json({ ok: true });
});

// ----------------------------------------------------
// 7. Backups Export & Import (Item 23, Owner only)
// ----------------------------------------------------
r.get(['/backup/export', '/backups/export'], requireOwner, async (req, res) => {
  const [domains, settings, blocklists, posts] = await Promise.all([
    Domain.find().select('name active isDefault status').lean(),
    Setting.find().lean(),
    Blocklist.find().select('type value reason').lean(),
    Post.find().select('title slug body metaDescription published author').lean(),
  ]);

  const backupData = {
    exportedAt: new Date().toISOString(),
    version: '1.0',
    domains,
    settings: settings.map((s) => ({ key: s.key, value: s.value })),
    blocklists,
    posts,
  };

  await logAudit(req, 'export_backup');

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=tempmail-backup-${new Date().toISOString().slice(0, 10)}.json`);
  res.send(JSON.stringify(backupData, null, 2));
});

r.post(['/backup/import', '/backups/import'], requireOwner, async (req, res) => {
  const data = req.body || {};
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Invalid backup file format.' });
  }

  const dryRun = req.query?.dryRun === 'true';

  const previewCounts = {
    domains: Array.isArray(data.domains) ? data.domains.length : 0,
    settings: Array.isArray(data.settings) ? data.settings.length : 0,
    blocklists: Array.isArray(data.blocklists) ? data.blocklists.length : 0,
    posts: Array.isArray(data.posts) ? data.posts.length : 0,
  };

  if (dryRun) {
    return res.json({
      dryRun: true,
      message: 'Dry-run preview validated successfully. No data was modified.',
      counts: previewCounts,
    });
  }

  // Real Import Execution
  if (Array.isArray(data.domains)) {
    for (const d of data.domains) {
      if (d.name) {
        await Domain.updateOne({ name: d.name.toLowerCase().trim() }, { active: d.active !== false }, { upsert: true });
      }
    }
  }

  if (Array.isArray(data.settings)) {
    for (const s of data.settings) {
      if (s.key && s.value !== undefined) {
        await Setting.updateOne({ key: s.key }, { value: s.value }, { upsert: true });
      }
    }
  }

  if (Array.isArray(data.blocklists)) {
    for (const b of data.blocklists) {
      if (b.type && b.value) {
        await Blocklist.updateOne({ type: b.type, value: b.value.toLowerCase().trim() }, { reason: b.reason || '' }, { upsert: true });
      }
    }
  }

  if (Array.isArray(data.posts)) {
    for (const p of data.posts) {
      if (p.slug && p.title && p.body) {
        await Post.updateOne({ slug: p.slug.toLowerCase().trim() }, { ...p }, { upsert: true });
      }
    }
  }

  await logAudit(req, 'import_backup', { counts: previewCounts });

  res.json({
    ok: true,
    message: 'Backup data imported successfully.',
    counts: previewCounts,
  });
});

// ----------------------------------------------------
// 8. Messages, Domains, Posts & Settings
// ----------------------------------------------------
r.get('/spam-queue', async (_req, res) => {
  const messages = await Message.find({
    $or: [
      { isSpam: true },
      { spamScore: { $gte: 50 } },
      { phishingWarning: { $ne: null } },
    ],
  })
    .sort({ receivedAt: -1 })
    .limit(100)
    .select('address from subject receivedAt size spamScore isSpam phishingWarning')
    .lean();

  res.json(messages);
});

r.post('/messages/bulk-delete', async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (!ids.length) return res.status(400).json({ error: 'ids array is required.' });

  try {
    const mongoose = (await import('mongoose')).default;
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'attachments' });
    const msgsWithAttachments = await Message.find({ _id: { $in: ids }, 'attachments.0': { $exists: true } }).lean();
    for (const msg of msgsWithAttachments) {
      if (Array.isArray(msg.attachments)) {
        for (const att of msg.attachments) {
          if (att.gridfsId) {
            await bucket.delete(new mongoose.Types.ObjectId(att.gridfsId)).catch(() => {});
          }
        }
      }
    }
  } catch {}

  const result = await Message.deleteMany({ _id: { $in: ids } });
  await logAudit(req, 'bulk_delete_messages', { count: result.deletedCount });

  res.json({ ok: true, deletedCount: result.deletedCount });
});

r.get('/messages', async (_q, res) =>
  res.json(await Message.find().sort({ receivedAt: -1 }).limit(100).select('address from subject receivedAt size spamScore isSpam').lean()));

r.delete('/messages/:id', async (req, res) => {
  await Message.deleteOne({ _id: req.params.id });
  await logAudit(req, 'delete_message', { id: req.params.id });
  res.json({ ok: true });
});

r.post('/purge', requireOwner, async (req, res) => {
  await Message.deleteMany({});
  await Mailbox.deleteMany({});
  await logAudit(req, 'purge_all_messages_and_mailboxes');
  res.json({ ok: true });
});

r.post('/cleanup', requireOwner, async (req, res) => {
  const settings = await getSettings();
  const days = Number(req.body?.days) || Number(settings.dataRetentionDays) || 7;
  const summary = await cleanupOldData(days);
  await logAudit(req, 'manual_data_cleanup', { retentionDays: days, totalDeleted: summary.totalDeleted });
  res.json(summary);
});

r.get('/cleanup-status', async (_q, res) => {
  const settings = await getSettings();
  const lastCleanup = (await Setting.findOne({ key: 'lastDataCleanup' }).lean())?.value || null;
  res.json({
    retentionDays: Number(settings.dataRetentionDays) || 7,
    autoCleanupEnabled: settings.autoCleanupEnabled !== false,
    lastCleanup,
  });
});

// Domains (Requires Owner)
r.get('/domains', async (_q, res) => res.json(await Domain.find().sort({ createdAt: 1 }).lean()));

r.post('/domains', requireOwner, async (req, res) => {
  const name = String(req.body?.name || '').toLowerCase().trim();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(name)) return res.status(400).json({ error: 'Enter a valid domain, like example.com.' });
  try {
    const created = await Domain.create({ name });
    await logAudit(req, 'create_domain', { name });
    res.json(created);
  } catch {
    res.status(409).json({ error: 'That domain is already added.' });
  }
});

r.patch('/domains/:id', requireOwner, async (req, res) => {
  const domain = await Domain.findById(req.params.id);
  if (!domain) return res.status(404).json({ error: 'Domain not found.' });

  if (req.body?.active === false && domain.active) {
    const remainingActive = await Domain.countDocuments({ active: true, _id: { $ne: req.params.id } });
    if (remainingActive === 0) {
      return res.status(400).json({ error: 'Cannot pause the only active domain. At least one domain must remain active.' });
    }
  }

  const d = await Domain.findByIdAndUpdate(req.params.id, { active: !!req.body?.active }, { new: true });
  await logAudit(req, 'toggle_domain_active', { id: req.params.id, active: !!req.body?.active });
  res.json(d);
});

r.delete('/domains/:id', requireOwner, async (req, res) => {
  const domain = await Domain.findById(req.params.id);
  if (!domain) return res.status(404).json({ error: 'Domain not found.' });

  if (domain.active) {
    const remainingActive = await Domain.countDocuments({ active: true, _id: { $ne: req.params.id } });
    if (remainingActive === 0) {
      return res.status(400).json({ error: 'Cannot remove the only active domain. Please add another active domain first.' });
    }
  }

  await Domain.deleteOne({ _id: req.params.id });

  if (domain.isDefault) {
    const nextDefault = await Domain.findOne({ active: true });
    if (nextDefault) {
      nextDefault.isDefault = true;
      await nextDefault.save();
      await Setting.updateOne({ key: 'defaultDomain' }, { value: nextDefault.name }, { upsert: true });
    }
  }

  await logAudit(req, 'delete_domain', { id: req.params.id, name: domain.name });
  res.json({ ok: true });
});

r.post('/domains/:id/check', async (req, res) => {
  const domain = await Domain.findById(req.params.id);
  if (!domain) return res.status(404).json({ error: 'Domain not found.' });
  const updated = await checkDomainHealth(domain);
  res.json(updated);
});

r.post('/domains/:id/make-default', requireOwner, async (req, res) => {
  const domain = await Domain.findById(req.params.id);
  if (!domain) return res.status(404).json({ error: 'Domain not found.' });
  await Domain.updateMany({}, { isDefault: false });
  domain.isDefault = true;
  await domain.save();
  await Setting.updateOne({ key: 'defaultDomain' }, { value: domain.name }, { upsert: true });
  await logAudit(req, 'make_default_domain', { name: domain.name });
  res.json(domain);
});

// ----------------------------------------------------
// Users & Account Lifecycle Management
// ----------------------------------------------------

// Export users as CSV
r.get('/users/export', async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 }).lean();
  const headers = ['ID', 'Email', 'Status', 'IsPremium', 'PremiumUntil', 'CreatedAt'];
  const rows = users.map((u) => [
    u._id,
    `"${(u.email || '').replace(/"/g, '""')}"`,
    u.status || 'active',
    u.isPremium ? 'true' : 'false',
    u.premiumUntil ? new Date(u.premiumUntil).toISOString() : '',
    u.createdAt ? new Date(u.createdAt).toISOString() : '',
  ].join(','));

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="users-export.csv"');
  res.send([headers.join(','), ...rows].join('\n'));
});

// Paginated Users list with search, filter, and sorting
r.get('/users', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const query = {};
  if (req.query.search) {
    const s = String(req.query.search).trim();
    query.email = new RegExp(s, 'i');
  }

  if (req.query.status && ['active', 'suspended', 'banned'].includes(req.query.status)) {
    query.status = req.query.status;
  }

  if (req.query.premium === 'premium') {
    query.isPremium = true;
    query.$or = [{ premiumUntil: { $exists: false } }, { premiumUntil: { $gt: new Date() } }];
  } else if (req.query.premium === 'free') {
    query.isPremium = false;
  } else if (req.query.premium === 'expired') {
    query.isPremium = true;
    query.premiumUntil = { $lte: new Date() };
  }

  let sort = { createdAt: -1 };
  if (req.query.sort === 'createdAt_asc') sort = { createdAt: 1 };
  else if (req.query.sort === 'email_asc') sort = { email: 1 };

  const [users, total] = await Promise.all([
    User.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .select('email status isPremium premiumUntil createdAt lastLoginAt apiKeys')
      .lean(),
    User.countDocuments(query),
  ]);

  res.json({
    users,
    total,
    page,
    totalPages: Math.ceil(total / limit) || 1,
  });
});

// User Detail Drawer Endpoint
r.get('/users/:id', async (req, res) => {
  const user = await User.findById(req.params.id).lean();
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const [payments, mailboxCount] = await Promise.all([
    Payment.find({ $or: [{ userId: user._id }, { userEmail: user.email }] }).sort({ createdAt: -1 }).lean(),
    Mailbox.countDocuments({ address: new RegExp(`@${process.env.DEFAULT_DOMAIN || '.*'}`) }).catch(() => 0),
  ]);

  res.json({
    user,
    apiKeys: (user.apiKeys || []).map((k) => ({
      keyId: k.keyId,
      name: k.name,
      prefix: k.prefix,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt,
    })),
    payments,
    mailboxCount,
  });
});

r.post('/users/:id/grant-premium', async (req, res) => {
  const days = Number(req.body?.days || 30);
  const premiumUntil = new Date(Date.now() + days * 864e5);
  const u = await User.findByIdAndUpdate(req.params.id, { isPremium: true, premiumUntil }, { new: true });
  if (!u) return res.status(404).json({ error: 'User not found.' });
  await logAudit(req, 'grant_premium', { user: u.email, days });
  res.json(u);
});

r.post('/users/:id/grant-custom-premium', async (req, res) => {
  const days = Number(req.body?.days) || 30;
  const reason = String(req.body?.reason || 'Custom grant by admin');
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  user.isPremium = true;
  const currentEnd = (user.premiumUntil && new Date(user.premiumUntil) > new Date())
    ? new Date(user.premiumUntil).getTime()
    : Date.now();
  user.premiumUntil = new Date(currentEnd + days * 864e5);
  await user.save();

  await logAudit(req, 'grant_custom_premium', { user: user.email, days, reason });
  res.json(user);
});

r.post('/users/:id/revoke-premium', async (req, res) => {
  const u = await User.findByIdAndUpdate(req.params.id, { isPremium: false, premiumUntil: null }, { new: true });
  if (!u) return res.status(404).json({ error: 'User not found.' });
  await logAudit(req, 'revoke_premium', { user: u.email });
  res.json(u);
});

r.post('/users/:id/suspend', async (req, res) => {
  const reason = String(req.body?.reason || 'Administrative suspension');
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  user.status = 'suspended';
  user.suspendedReason = reason;
  user.suspendedAt = new Date();
  user.tokenRevokedAt = new Date(); // Immediately revokes active user JWTs
  await user.save();

  await logAudit(req, 'suspend_user', { email: user.email, reason });
  res.json(user);
});

r.post('/users/:id/reactivate', async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  user.status = 'active';
  user.suspendedReason = null;
  user.suspendedAt = null;
  await user.save();

  await logAudit(req, 'reactivate_user', { email: user.email });
  res.json(user);
});

r.delete('/users/:id/api-keys/:keyId', async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  user.apiKeys = (user.apiKeys || []).filter((k) => k.keyId !== req.params.keyId);
  await user.save();

  await logAudit(req, 'revoke_user_api_key', { email: user.email, keyId: req.params.keyId });
  res.json({ ok: true, apiKeys: user.apiKeys });
});

// ----------------------------------------------------
// Payments & Revenue Intelligence
// ----------------------------------------------------

r.get('/payments', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const query = {};
  if (req.query.provider) query.provider = req.query.provider;
  if (req.query.status) query.status = req.query.status;
  if (req.query.search) {
    const s = String(req.query.search).trim();
    query.$or = [
      { userEmail: new RegExp(s, 'i') },
      { orderId: new RegExp(s, 'i') },
      { paymentId: new RegExp(s, 'i') },
    ];
  }

  const [payments, total] = await Promise.all([
    Payment.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Payment.countDocuments(query),
  ]);

  res.json({
    payments,
    total,
    page,
    totalPages: Math.ceil(total / limit) || 1,
  });
});

r.get('/payments/stats', async (_q, res) => {
  const totalUsers = await User.countDocuments();
  const premiumUsers = await User.countDocuments({
    isPremium: true,
    $or: [{ premiumUntil: { $exists: false } }, { premiumUntil: { $gt: new Date() } }],
  });

  const mrr = premiumUsers * 4.99;
  const conversionRate = totalUsers > 0 ? Number(((premiumUsers / totalUsers) * 100).toFixed(1)) : 0;

  const sevenDaysFromNow = new Date(Date.now() + 7 * 864e5);
  const expiringIn7Days = await User.countDocuments({
    isPremium: true,
    premiumUntil: { $gt: new Date(), $lte: sevenDaysFromNow },
  });

  const sevenDaysAgo = new Date(Date.now() - 7 * 864e5);
  const newPremiumThisWeek = await Payment.countDocuments({
    status: 'finished',
    createdAt: { $gte: sevenDaysAgo },
  });

  const revenueAgg = await Payment.aggregate([
    { $match: { status: 'finished' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  res.json({
    mrr,
    totalRevenue: revenueAgg[0]?.total || 0,
    conversionRate,
    expiringIn7Days,
    newPremiumThisWeek,
    activeSubscribers: premiumUsers,
  });
});

r.get('/payments/webhooks', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    WebhookLog.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    WebhookLog.countDocuments(),
  ]);

  res.json({
    logs,
    total,
    page,
    totalPages: Math.ceil(total / limit) || 1,
  });
});

r.post('/payments/reconcile', async (req, res) => {
  const { paymentId, grantDays = 30, note = '' } = req.body || {};
  if (!paymentId) return res.status(400).json({ error: 'paymentId is required' });

  const payment = await Payment.findById(paymentId);
  if (!payment) return res.status(404).json({ error: 'Payment not found.' });

  if (payment.reconciled) {
    return res.json({ message: 'Payment is already reconciled.', payment });
  }

  payment.status = 'finished';
  payment.reconciled = true;
  payment.reconciledBy = req.adminEmail;
  payment.reconciledAt = new Date();
  payment.reconcileNote = note;
  await payment.save();

  let user = null;
  if (payment.userId) {
    user = await User.findById(payment.userId);
  } else if (payment.userEmail) {
    user = await User.findOne({ email: payment.userEmail });
  }

  if (user) {
    user.isPremium = true;
    const currentEnd = (user.premiumUntil && new Date(user.premiumUntil) > new Date())
      ? new Date(user.premiumUntil).getTime()
      : Date.now();
    user.premiumUntil = new Date(currentEnd + Number(grantDays) * 864e5);
    await user.save();
  }

  await logAudit(req, 'reconcile_payment', {
    paymentId: payment._id,
    orderId: payment.orderId,
    grantDays,
    note,
  });

  res.json({ success: true, payment, user });
});

// Blog Posts CRUD
r.get('/posts', async (_q, res) => {
  res.json(await Post.find().sort({ createdAt: -1 }).lean());
});

r.post('/posts', async (req, res) => {
  const { title, slug, body, metaDescription, published } = req.body || {};
  if (!title || !slug || !body) return res.status(400).json({ error: 'Title, slug, and body are required.' });
  try {
    const post = await Post.create({
      title,
      slug: String(slug).toLowerCase().trim(),
      body,
      metaDescription: metaDescription || '',
      published: !!published,
      author: req.adminEmail,
    });
    await logAudit(req, 'create_post', { slug: post.slug });
    res.json(post);
  } catch {
    res.status(409).json({ error: 'A post with that slug already exists.' });
  }
});

r.put('/posts/:id', async (req, res) => {
  const { title, slug, body, metaDescription, published } = req.body || {};
  const updateData = {};
  if (title !== undefined) updateData.title = title;
  if (slug !== undefined) updateData.slug = String(slug).toLowerCase().trim();
  if (body !== undefined) updateData.body = body;
  if (metaDescription !== undefined) updateData.metaDescription = metaDescription;
  if (published !== undefined) updateData.published = !!published;

  const post = await Post.findByIdAndUpdate(req.params.id, updateData, { new: true });
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  await logAudit(req, 'update_post', { slug: post.slug });
  res.json(post);
});

r.delete('/posts/:id', async (req, res) => {
  const post = await Post.findByIdAndDelete(req.params.id);
  if (post) await logAudit(req, 'delete_post', { slug: post.slug });
  res.json({ ok: true });
});

// Settings (Requires Owner)
r.get('/settings', async (_q, res) => res.json(await getSettings()));
r.put('/settings', requireOwner, async (req, res) => {
  const ttl = Number(req.body?.ttlMinutes), kb = Number(req.body?.maxMessageKB);
  if (!(ttl >= 5 && ttl <= 1440)) return res.status(400).json({ error: 'Inbox lifetime must be between 5 and 1440 minutes.' });
  if (!(kb >= 64 && kb <= 10240)) return res.status(400).json({ error: 'Max message size must be between 64 and 10240 KB.' });

  const limit10m = req.body?.rateLimit10m !== undefined ? Number(req.body.rateLimit10m) : 20;
  if (!(limit10m >= 1 && limit10m <= 1000)) return res.status(400).json({ error: '10-minute rate limit must be between 1 and 1000.' });

  const limitDaily = req.body?.rateLimitDaily !== undefined ? Number(req.body.rateLimitDaily) : 100;
  if (!(limitDaily >= 1 && limitDaily <= 10000)) return res.status(400).json({ error: 'Daily rate limit must be between 1 and 10000.' });

  const attachmentMB = req.body?.maxAttachmentMB !== undefined ? Number(req.body.maxAttachmentMB) : 5;
  if (!(attachmentMB >= 1 && attachmentMB <= 50)) return res.status(400).json({ error: 'Max attachment size must be between 1 and 50 MB.' });

  let reserved = undefined;
  if (req.body?.reservedNames !== undefined) {
    if (Array.isArray(req.body.reservedNames)) {
      reserved = req.body.reservedNames.map((x) => String(x).toLowerCase().trim()).filter(Boolean);
    } else if (typeof req.body.reservedNames === 'string') {
      reserved = req.body.reservedNames.split(',').map((x) => x.toLowerCase().trim()).filter(Boolean);
    }
  }

  const updates = [
    ['ttlMinutes', ttl],
    ['maxMessageKB', kb],
    ['rateLimit10m', limit10m],
    ['rateLimitDaily', limitDaily],
    ['maxAttachmentMB', attachmentMB],
  ];
  if (reserved) updates.push(['reservedNames', reserved]);

  if (req.body?.adsEnabled !== undefined) updates.push(['adsEnabled', !!req.body.adsEnabled]);
  if (req.body?.adHeader !== undefined) updates.push(['adHeader', String(req.body.adHeader)]);
  if (req.body?.adBelowCard !== undefined) updates.push(['adBelowCard', String(req.body.adBelowCard)]);
  if (req.body?.adSidebar !== undefined) updates.push(['adSidebar', String(req.body.adSidebar)]);
  if (req.body?.autoPauseFailingDomains !== undefined) updates.push(['autoPauseFailingDomains', !!req.body.autoPauseFailingDomains]);
  if (req.body?.defaultDomain !== undefined) updates.push(['defaultDomain', String(req.body.defaultDomain).toLowerCase().trim()]);
  if (req.body?.dataRetentionDays !== undefined) {
    const days = Number(req.body.dataRetentionDays);
    if (!(days >= 1 && days <= 365)) return res.status(400).json({ error: 'Data retention period must be between 1 and 365 days.' });
    updates.push(['dataRetentionDays', days]);
  }
  if (req.body?.autoCleanupEnabled !== undefined) {
    updates.push(['autoCleanupEnabled', !!req.body.autoCleanupEnabled]);
  }
  if (req.body?.maintenanceMode !== undefined) updates.push(['maintenanceMode', !!req.body.maintenanceMode]);
  if (req.body?.featureFlags !== undefined) updates.push(['featureFlags', req.body.featureFlags]);
  if (req.body?.announcementBanner !== undefined) updates.push(['announcementBanner', req.body.announcementBanner]);
  if (req.body?.telegramWebhookUrl !== undefined) updates.push(['telegramWebhookUrl', String(req.body.telegramWebhookUrl)]);
  if (req.body?.ipAllowlist !== undefined) updates.push(['ipAllowlist', Array.isArray(req.body.ipAllowlist) ? req.body.ipAllowlist : []]);

  for (const [key, value] of updates) {
    await Setting.updateOne({ key }, { value }, { upsert: true });
  }

  await logAudit(req, 'update_settings', { updates: updates.map(([k]) => k) });
  res.json(await getSettings());
});

export default r;
