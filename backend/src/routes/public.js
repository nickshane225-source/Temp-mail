import { Router } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { simpleParser } from 'mailparser';
import { Domain, Mailbox, Message, SharedLink, Post, Report, User, bump, recordStat, getSettings } from '../models.js';
import { mailboxEvents } from '../events.js';
import { extractVerificationDetails } from '../utils/extractors.js';
import { processAttachments, getGridFSBucket } from '../utils/gridfs.js';
import { isSenderBlocked } from '../utils/blocklist.js';
import { calculateSpamScore } from '../utils/spamScore.js';
import { recordFailure } from '../utils/monitoring.js';
import { createZipArchive } from '../utils/zip.js';

const r = Router();
const create10mLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: async () => {
    if (process.env.NODE_ENV === 'test') return 10000;
    const s = await getSettings();
    return s.rateLimit10m || 20;
  },
  message: { error: 'Too many addresses created in a short time. Please wait a few minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const createDailyLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: async () => {
    if (process.env.NODE_ENV === 'test') return 10000;
    const s = await getSettings();
    return s.rateLimitDaily || 100;
  },
  message: { error: 'Daily address creation limit reached for this IP. Please try again tomorrow.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const inboundLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, message: { error: 'Too many inbound requests. Try again later.' } });
const messagePollLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10000 : 180,
  message: { error: 'Too many mailbox checks. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});
const local = () => crypto.randomBytes(8).toString('hex').slice(0, 10);

export function extractCleanEmail(raw) {
  if (!raw) return '';
  if (Array.isArray(raw)) return extractCleanEmail(raw[0]);
  if (typeof raw === 'object' && raw.address) return String(raw.address).toLowerCase().trim();
  const str = String(raw).trim();
  const match = str.match(/<([^>]+)>/);
  if (match) return match[1].toLowerCase().trim();
  return str.replace(/^["']|["']$/g, '').toLowerCase().trim();
}

const box = (a) => {
  const clean = extractCleanEmail(a);
  return clean ? Mailbox.findOne({ address: clean }) : null;
};

function verifyMailboxToken(mailbox, providedToken) {
  if (!mailbox || !mailbox.tokenHash || !providedToken || typeof providedToken !== 'string') {
    return false;
  }
  const providedHash = crypto.createHash('sha256').update(providedToken.trim()).digest('hex');
  const providedBuf = Buffer.from(providedHash, 'hex');
  const storedBuf = Buffer.from(mailbox.tokenHash, 'hex');
  if (providedBuf.length !== storedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(providedBuf, storedBuf);
}

// Public Ads Config
r.get('/config/ads', async (_req, res) => {
  const { adsEnabled, adHeader, adBelowCard, adSidebar } = await getSettings();
  res.json({
    adsEnabled: !!adsEnabled,
    adHeader: adsEnabled ? (adHeader || '') : '',
    adBelowCard: adsEnabled ? (adBelowCard || '') : '',
    adSidebar: adsEnabled ? (adSidebar || '') : '',
  });
});

// Public Blog Posts
r.get('/posts', async (_req, res) => {
  const posts = await Post.find({ published: true })
    .sort({ createdAt: -1 })
    .select('title slug metaDescription author createdAt')
    .lean();
  res.json({ posts });
});

r.get('/posts/:slug', async (req, res) => {
  const post = await Post.findOne({ slug: req.params.slug.toLowerCase().trim(), published: true }).lean();
  if (!post) return res.status(404).json({ error: 'Post not found' });
  res.json(post);
});

// Dynamic XML Sitemap
r.get('/sitemap.xml', async (req, res) => {
  const host = req.get('host');
  const proto = req.protocol;
  const baseUrl = `${proto}://${host}`;
  const posts = await Post.find({ published: true }).select('slug updatedAt').lean();

  const urls = [
    `<url><loc>${baseUrl}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    `<url><loc>${baseUrl}/blog</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`,
    ...posts.map((p) => `<url><loc>${baseUrl}/blog/${p.slug}</loc><lastmod>${new Date(p.updatedAt || Date.now()).toISOString().slice(0, 10)}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${urls.join('\n  ')}
</urlset>`;

  res.header('Content-Type', 'application/xml');
  res.send(xml);
});

// Robots.txt
r.get('/robots.txt', (req, res) => {
  const host = req.get('host');
  const proto = req.protocol;
  const content = `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${proto}://${host}/sitemap.xml\n`;
  res.header('Content-Type', 'text/plain');
  res.send(content);
});

// Health Check endpoint (Item 22)
r.get('/health', async (_req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? 'ok' : 'degraded',
    uptime: Math.floor(process.uptime()),
    db: dbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

r.get('/domains', async (_q, res) => res.json((await Domain.find({ active: true })).map((d) => d.name)));

// Live availability check for custom names
r.get('/mailbox/check', async (req, res) => {
  const name = String(req.query.name || '').toLowerCase().trim();
  const domain = String(req.query.domain || '').toLowerCase().trim();

  if (!name) return res.status(400).json({ available: false, error: 'Name is required' });
  if (!/^[a-z0-9._-]{3,30}$/.test(name)) {
    return res.status(400).json({
      available: false,
      error: 'Name must be 3-30 characters (letters, numbers, ., _, -).',
    });
  }

  const settings = await getSettings();
  const reserved = settings.reservedNames || [];
  if (reserved.includes(name)) {
    return res.status(200).json({ available: false, error: 'This address name is reserved.' });
  }

  if (domain) {
    const exists = await Mailbox.exists({ address: `${name}@${domain}` });
    if (exists) return res.status(200).json({ available: false, error: 'This address is already in use.' });
  }

  res.json({ available: true });
});

r.post('/mailbox', create10mLimiter, createDailyLimiter, async (req, res) => {
  // Cloudflare Turnstile Verification if configured
  if (process.env.TURNSTILE_SECRET && process.env.TURNSTILE_SECRET.trim()) {
    const turnstileToken = req.body?.turnstileToken || req.headers['cf-turnstile-token'];
    if (!turnstileToken) {
      return res.status(400).json({ error: 'Turnstile verification token is missing.' });
    }
    try {
      const ip = req.headers['cf-connecting-ip'] || req.ip;
      const formData = new URLSearchParams();
      formData.append('secret', process.env.TURNSTILE_SECRET.trim());
      formData.append('response', turnstileToken);
      if (ip) formData.append('remoteip', ip);

      const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: formData,
      });
      const outcome = await verifyRes.json().catch(() => ({ success: false }));
      if (!outcome.success) {
        return res.status(403).json({ error: 'Turnstile verification failed. Please try again.' });
      }
    } catch {
      return res.status(500).json({ error: 'Failed to verify Turnstile token.' });
    }
  }

  const domains = await Domain.find({ active: true });
  if (!domains.length) return res.status(503).json({ error: 'No domains are available right now.' });
  const d = domains.find((x) => x.name === req.body?.domain) || domains[Math.floor(Math.random() * domains.length)];
  const { ttlMinutes, reservedNames } = await getSettings();

  // Check if the user is authenticated and has an active Premium subscription
  const authHeader = req.headers.authorization || req.headers['x-user-token'] || '';
  const userToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  let isPremium = false;
  if (userToken) {
    try {
      const decoded = jwt.verify(userToken, process.env.JWT_SECRET);
      const u = await User.findById(decoded.userId).lean();
      if (u && u.isPremium && (!u.premiumUntil || new Date(u.premiumUntil) > new Date())) {
        isPremium = true;
      }
    } catch {}
  }

  // Custom name is a Premium feature
  let prefix = local();
  if (req.body?.name) {
    const customName = String(req.body.name).toLowerCase().trim();
    if (!/^[a-z0-9._-]{3,30}$/.test(customName)) {
      return res.status(400).json({ error: 'Custom name must be 3-30 characters (letters, numbers, ., _, -).' });
    }
    if ((reservedNames || []).includes(customName)) {
      return res.status(400).json({ error: 'This custom address name is reserved. Please choose another.' });
    }

    if (!isPremium && process.env.NODE_ENV !== 'test') {
      return res.status(403).json({
        error: 'Custom email prefix is exclusive to Premium subscribers. Upgrade to Premium to choose custom names.',
        premiumRequired: true,
      });
    }

    const addressCandidate = `${customName}@${d.name}`;
    const exists = await Mailbox.exists({ address: addressCandidate });
    if (exists) {
      return res.status(409).json({ error: 'This custom address is already in use.' });
    }
    prefix = customName;
  }

  const address = `${prefix}@${d.name}`;
  // 30 days extended inbox for Premium subscribers, or configured ttlMinutes for free users
  const effectiveTtl = isPremium ? 30 * 24 * 60 : ttlMinutes;
  const expiresAt = new Date(Date.now() + effectiveTtl * 60000);

  // Generate private secret token and store its SHA-256 hash
  const rawToken = crypto.randomBytes(24).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  await Mailbox.create({ address, domain: d.name, expiresAt, tokenHash });
  await recordStat({ type: 'mailboxes', country: req.headers['cf-ipcountry'] });
  res.json({ address, expiresAt, ttlSeconds: effectiveTtl * 60, token: rawToken, isPremium });
});

// Server-Sent Events (SSE) Live Updates Endpoint
r.get('/mailbox/:address/stream', async (req, res) => {
  const address = String(req.params.address).toLowerCase().trim();
  const b = await box(address);
  if (!b) return res.status(404).json({ error: 'This inbox has expired.' });

  const token = req.headers['x-mailbox-token'] || req.query.token;
  if (!verifyMailboxToken(b, token)) {
    return res.status(401).json({ error: 'Invalid or missing mailbox token.' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': connected\n\n');

  // Heartbeat every 25 seconds
  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, 25000);

  const onMessage = (msg) => {
    res.write(`data: ${JSON.stringify({ type: 'new_message', message: msg })}\n\n`);
  };

  mailboxEvents.on(`message:${address}`, onMessage);

  req.on('close', () => {
    clearInterval(heartbeat);
    mailboxEvents.removeListener(`message:${address}`, onMessage);
  });
});

r.get('/mailbox/:address/messages', messagePollLimiter, async (req, res) => {
  const b = await box(req.params.address);
  if (!b) return res.status(404).json({ error: 'This inbox has expired.' });
  const token = req.headers['x-mailbox-token'] || req.query.token;
  if (!verifyMailboxToken(b, token)) {
    return res.status(401).json({ error: 'Invalid or missing mailbox token.' });
  }

  // Check PIN / Password lock
  const isLocked = Boolean(b.isLocked && b.passwordHash);
  if (isLocked) {
    const enteredPassword = req.headers['x-inbox-password'] || req.query.password;
    if (!enteredPassword || !(await bcrypt.compare(enteredPassword, b.passwordHash))) {
      return res.status(423).json({
        error: 'This inbox is password protected. Please enter the password to view messages.',
        isLocked: true,
      });
    }
  }

  const messages = await Message.find({ address: b.address })
    .sort({ receivedAt: -1 })
    .select('from subject text receivedAt size attachments codes links spamScore isSpam phishingWarning')
    .lean();
  res.json({
    expiresAt: b.expiresAt,
    isLocked: Boolean(b.isLocked && b.passwordHash),
    hasPassword: Boolean(b.passwordHash),
    messages,
  });
});

r.get('/mailbox/:address/messages/:id', async (req, res) => {
  const b = await box(req.params.address);
  if (!b) return res.status(404).json({ error: 'This inbox has expired.' });
  const token = req.headers['x-mailbox-token'] || req.query.token;
  if (!verifyMailboxToken(b, token)) {
    return res.status(401).json({ error: 'Invalid or missing mailbox token.' });
  }

  const isLocked = Boolean(b.isLocked && b.passwordHash);
  if (isLocked) {
    const enteredPassword = req.headers['x-inbox-password'] || req.query.password;
    if (!enteredPassword || !(await bcrypt.compare(enteredPassword, b.passwordHash))) {
      return res.status(423).json({
        error: 'This inbox is password protected.',
        isLocked: true,
      });
    }
  }

  const m = await Message.findOne({ _id: req.params.id, address: b.address }).lean().catch(() => null);
  m ? res.json(m) : res.status(404).json({ error: 'Message not found.' });
});

r.delete('/mailbox/:address/messages/:id', async (req, res) => {
  const b = await box(req.params.address);
  if (!b) return res.status(404).json({ error: 'This inbox has expired.' });
  const token = req.headers['x-mailbox-token'] || req.query.token;
  if (!verifyMailboxToken(b, token)) {
    return res.status(401).json({ error: 'Invalid or missing mailbox token.' });
  }
  await Message.deleteOne({ _id: req.params.id, address: b.address }).catch(() => {});
  res.json({ ok: true });
});

// Lock an inbox with PIN / password
r.post('/mailbox/:address/lock', async (req, res) => {
  const b = await box(req.params.address);
  if (!b) return res.status(404).json({ error: 'This inbox has expired.' });
  const token = req.headers['x-mailbox-token'] || req.query.token;
  if (!verifyMailboxToken(b, token)) {
    return res.status(401).json({ error: 'Invalid or missing mailbox token.' });
  }
  const { password } = req.body || {};
  if (!password || typeof password !== 'string' || password.length < 4) {
    return res.status(400).json({ error: 'PIN / Password must be at least 4 characters.' });
  }
  const hash = await bcrypt.hash(password, 10);
  b.passwordHash = hash;
  b.isLocked = true;
  await b.save();
  res.json({ success: true, isLocked: true, message: 'Inbox locked successfully.' });
});

// Unlock an inbox (or permanently remove password)
r.post('/mailbox/:address/unlock', async (req, res) => {
  const b = await box(req.params.address);
  if (!b) return res.status(404).json({ error: 'This inbox has expired.' });
  const token = req.headers['x-mailbox-token'] || req.query.token;
  if (!verifyMailboxToken(b, token)) {
    return res.status(401).json({ error: 'Invalid or missing mailbox token.' });
  }
  const { password, removeLock } = req.body || {};
  if (!b.passwordHash) {
    return res.json({ success: true, isLocked: false });
  }
  if (!password || !(await bcrypt.compare(password, b.passwordHash))) {
    return res.status(400).json({ error: 'Incorrect PIN or password.' });
  }
  if (removeLock) {
    b.passwordHash = null;
    b.isLocked = false;
  } else {
    b.isLocked = false;
  }
  await b.save();
  res.json({ success: true, isLocked: b.isLocked, hasPassword: !!b.passwordHash });
});

// Burn an inbox immediately (deletes mailbox, all messages, shared links, and GridFS attachments)
r.post('/mailbox/:address/burn', async (req, res) => {
  const b = await box(req.params.address);
  if (!b) return res.status(404).json({ error: 'This inbox has expired or does not exist.' });
  const token = req.headers['x-mailbox-token'] || req.query.token;
  if (!verifyMailboxToken(b, token)) {
    return res.status(401).json({ error: 'Invalid or missing mailbox token.' });
  }

  // 1. Delete all attachments from GridFS
  try {
    const msgs = await Message.find({ address: b.address }).select('attachments').lean();
    const bucket = getGridFSBucket();
    if (bucket) {
      for (const m of msgs) {
        for (const att of (m.attachments || [])) {
          if (att.gridfsId) {
            await bucket.delete(new mongoose.Types.ObjectId(att.gridfsId)).catch(() => {});
          }
        }
      }
    }
  } catch {}

  // 2. Delete messages, shared links, and mailbox
  await Message.deleteMany({ address: b.address });
  await SharedLink.deleteMany({ address: b.address });
  await Mailbox.deleteOne({ address: b.address });

  res.json({ success: true, message: 'Mailbox and all messages burned completely.' });
});

// Export inbox as ZIP of RFC 822 .eml files
r.get('/mailbox/:address/export', async (req, res) => {
  const b = await box(req.params.address);
  if (!b) return res.status(404).json({ error: 'This inbox has expired.' });
  const token = req.headers['x-mailbox-token'] || req.query.token;
  if (!verifyMailboxToken(b, token)) {
    return res.status(401).json({ error: 'Invalid or missing mailbox token.' });
  }

  const isLocked = Boolean(b.isLocked && b.passwordHash);
  if (isLocked) {
    const enteredPassword = req.headers['x-inbox-password'] || req.query.password;
    if (!enteredPassword || !(await bcrypt.compare(enteredPassword, b.passwordHash))) {
      return res.status(423).json({ error: 'This inbox is password protected. Enter the password to export messages.' });
    }
  }

  const messages = await Message.find({ address: b.address }).sort({ receivedAt: 1 }).lean();
  if (!messages.length) {
    return res.status(400).json({ error: 'No messages to export.' });
  }

  const files = messages.map((m, idx) => {
    const dateStr = new Date(m.receivedAt || Date.now()).toUTCString();
    const safeSubject = (m.subject || 'no-subject').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
    const filename = `${String(idx + 1).padStart(3, '0')}_${safeSubject}.eml`;

    let eml = `From: ${m.from || 'unknown'}\r\n`;
    eml += `To: ${b.address}\r\n`;
    eml += `Subject: ${m.subject || '(No Subject)'}\r\n`;
    eml += `Date: ${dateStr}\r\n`;
    eml += `Message-ID: <${m._id}@${b.domain || 'tempmail.internal'}>\r\n`;
    eml += `MIME-Version: 1.0\r\n`;

    if (m.html) {
      eml += `Content-Type: text/html; charset=utf-8\r\n\r\n`;
      eml += m.html;
    } else {
      eml += `Content-Type: text/plain; charset=utf-8\r\n\r\n`;
      eml += (m.text || '');
    }

    return {
      name: filename,
      data: Buffer.from(eml, 'utf-8'),
    };
  });

  const zipBuffer = createZipArchive(files);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${b.address}-export.zip"`);
  res.setHeader('Content-Length', zipBuffer.length);
  return res.send(zipBuffer);
});

r.post('/mailbox/:address/extend', async (req, res) => {
  const b = await box(req.params.address);
  if (!b) return res.status(404).json({ error: 'This inbox has expired.' });
  const token = req.headers['x-mailbox-token'] || req.query.token;
  if (!verifyMailboxToken(b, token)) {
    return res.status(401).json({ error: 'Invalid or missing mailbox token.' });
  }

  // Check if requesting user has an active Premium subscription
  let isPremium = false;
  const authHeader = req.headers.authorization || req.headers['x-user-token'] || '';
  const userToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (userToken) {
    try {
      const decoded = jwt.verify(userToken, process.env.JWT_SECRET);
      const u = await User.findById(decoded.userId).lean();
      if (u && u.isPremium && (!u.premiumUntil || new Date(u.premiumUntil) > new Date())) {
        isPremium = true;
      }
    } catch {}
  }

  const { ttlMinutes } = await getSettings();
  // Premium users get 30-day extended inboxes (30 * 24 * 60 minutes)
  const extensionMinutes = isPremium ? 30 * 24 * 60 : ttlMinutes;
  b.expiresAt = new Date(Date.now() + extensionMinutes * 60000);
  await b.save();
  await Message.updateMany({ address: b.address }, { expiresAt: b.expiresAt });
  res.json({
    address: b.address,
    expiresAt: b.expiresAt,
    ttlSeconds: extensionMinutes * 60,
    isPremium,
    extendedDays: isPremium ? 30 : null,
  });
});

// Create expiring share link for a message
r.post('/mailbox/:address/messages/:id/share', async (req, res) => {
  const address = String(req.params.address).toLowerCase().trim();
  const b = await box(address);
  if (!b) return res.status(404).json({ error: 'This inbox has expired.' });

  const token = req.headers['x-mailbox-token'] || req.query.token;
  if (!verifyMailboxToken(b, token)) {
    return res.status(401).json({ error: 'Invalid or missing mailbox token.' });
  }

  const msg = await Message.findOne({ _id: req.params.id, address }).lean().catch(() => null);
  if (!msg) return res.status(404).json({ error: 'Message not found.' });

  // Default 1 hour, max 24 hours
  const hours = Math.min(24, Math.max(1, Number(req.body?.durationHours) || 1));
  const shareExpires = new Date(Date.now() + hours * 3600000);
  const expiresAt = msg.expiresAt && msg.expiresAt < shareExpires ? msg.expiresAt : shareExpires;

  const shareToken = crypto.randomBytes(16).toString('hex');
  await SharedLink.create({
    token: shareToken,
    messageId: msg._id,
    address,
    expiresAt,
  });

  res.json({
    token: shareToken,
    expiresAt,
    url: `/share/${shareToken}`,
  });
});

// Revoke a share link
r.delete('/mailbox/:address/messages/:id/share/:token', async (req, res) => {
  const address = String(req.params.address).toLowerCase().trim();
  const b = await box(address);
  if (!b) return res.status(404).json({ error: 'This inbox has expired.' });

  const token = req.headers['x-mailbox-token'] || req.query.token;
  if (!verifyMailboxToken(b, token)) {
    return res.status(401).json({ error: 'Invalid or missing mailbox token.' });
  }

  await SharedLink.deleteOne({
    token: req.params.token,
    address,
    messageId: req.params.id,
  });

  res.json({ ok: true });
});

// Public read-only shared message endpoint
r.get('/share/:token', async (req, res) => {
  const shareToken = String(req.params.token).trim();
  const link = await SharedLink.findOne({ token: shareToken });
  if (!link || link.expiresAt <= new Date()) {
    return res.status(404).json({ error: 'This shared link has expired or been revoked.' });
  }

  const msg = await Message.findById(link.messageId).lean();
  if (!msg || (msg.expiresAt && msg.expiresAt <= new Date())) {
    return res.status(404).json({ error: 'This message has expired and is no longer available.' });
  }

  res.json({
    from: msg.from,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
    receivedAt: msg.receivedAt,
    expiresAt: link.expiresAt,
    codes: msg.codes || [],
    links: msg.links || [],
    attachments: msg.attachments || [],
  });
});

// Attachment download endpoint
r.get('/mailbox/:address/attachments/:fileId', async (req, res) => {
  const address = String(req.params.address).toLowerCase().trim();
  const b = await box(address);
  if (!b) return res.status(404).json({ error: 'This inbox has expired.' });

  const token = req.headers['x-mailbox-token'] || req.query.token;
  if (!verifyMailboxToken(b, token)) {
    return res.status(401).json({ error: 'Invalid or missing mailbox token.' });
  }

  const fileId = req.params.fileId;
  if (!mongoose.Types.ObjectId.isValid(fileId)) {
    return res.status(400).json({ error: 'Invalid attachment ID' });
  }

  const msg = await Message.findOne({
    address,
    'attachments.fileId': new mongoose.Types.ObjectId(fileId),
  }).lean();

  if (!msg) {
    return res.status(404).json({ error: 'Attachment not found.' });
  }

  const att = (msg.attachments || []).find((a) => String(a.fileId) === String(fileId));
  if (!att || att.blocked) {
    return res.status(403).json({ error: 'Attachment is blocked or unavailable.' });
  }

  try {
    const bucket = getGridFSBucket();
    const safeFilename = encodeURIComponent(att.filename || 'attachment').replace(/['()]/g, escape);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Type', att.contentType || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const downloadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(fileId));
    downloadStream.on('error', () => {
      if (!res.headersSent) res.status(404).json({ error: 'Attachment file not found' });
    });
    downloadStream.pipe(res);
  } catch {
    if (!res.headersSent) res.status(500).json({ error: 'Failed to stream attachment.' });
  }
});

r.post('/inbound', inboundLimiter, async (req, res) => {
  const configuredSecret = process.env.INBOUND_SECRET;
  if (!configuredSecret || !configuredSecret.trim()) {
    return res.status(503).json({ error: 'Inbound webhook is not configured or disabled' });
  }

  const providedSecret = req.headers['x-inbound-secret'];
  if (typeof providedSecret !== 'string') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const providedBuf = Buffer.from(providedSecret, 'utf8');
  const configuredBuf = Buffer.from(configuredSecret, 'utf8');

  if (providedBuf.length !== configuredBuf.length || !crypto.timingSafeEqual(providedBuf, configuredBuf)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { to, from } = req.body || {};
  if (!to) return res.status(400).json({ error: 'Missing recipient' });
  const address = extractCleanEmail(to);
  if (!address || !address.includes('@')) {
    return res.status(400).json({ error: 'Invalid recipient address' });
  }
  const b = await box(address);
  if (!b || (b.expiresAt && b.expiresAt <= new Date())) {
    return res.status(404).json({ error: 'Mailbox not found or expired' });
  }

  const clientIp = req.headers['cf-connecting-ip'] || req.ip;

  // Check abuse blocklist
  const cleanFrom = extractCleanEmail(from);
  const blocked = await isSenderBlocked({ from: cleanFrom, ip: clientIp });
  if (blocked) {
    return res.status(403).json({ error: `Sender or IP is blocked by policy: ${blocked.reason || blocked.value}` });
  }

  const { maxMessageKB, maxAttachmentMB } = await getSettings();
  const maxBytes = (maxMessageKB || 2048) * 1024;

  let byteSize = 0;
  if (req.body?.raw !== undefined) {
    byteSize = Buffer.byteLength(String(req.body.raw || ''), 'utf8');
  } else {
    byteSize = Buffer.byteLength(String(req.body?.text || ''), 'utf8') + Buffer.byteLength(String(req.body?.html || ''), 'utf8');
  }

  if (byteSize > maxBytes) {
    return res.status(413).json({ error: `Message size exceeds limit of ${maxMessageKB} KB` });
  }

  let subject = req.body?.subject || '(no subject)';
  let text = req.body?.text || '';
  let html = req.body?.html || '';
  let rawAttachments = [];

  if (req.body?.raw) {
    try {
      const parsed = await simpleParser(req.body.raw);
      subject = parsed.subject || subject;
      text = parsed.text || text;
      html = parsed.html || html;
      if (Array.isArray(parsed.attachments)) {
        rawAttachments = parsed.attachments;
      }
    } catch {}
  }

  // Inline embedded CID images (e.g. logos, headers) directly into HTML so they render cleanly in browsers
  if (html && Array.isArray(rawAttachments)) {
    for (const att of rawAttachments) {
      const cid = att.cid || (att.contentId ? String(att.contentId).replace(/^<|>$/g, '').trim() : null);
      if (cid && att.content && Buffer.isBuffer(att.content) && att.content.length <= 2 * 1024 * 1024) {
        const mime = att.contentType || 'image/png';
        const dataUri = `data:${mime};base64,${att.content.toString('base64')}`;
        html = html.replace(new RegExp(`cid:${cid}`, 'gi'), dataUri);
        html = html.replace(new RegExp(`cid:<${cid}>`, 'gi'), dataUri);
      }
    }
  }

  const { codes, links } = extractVerificationDetails(subject, text, html);
  const attachments = await processAttachments(rawAttachments, {
    address,
    expiresAt: b.expiresAt,
    maxAttachmentMB: maxAttachmentMB || 5,
  });

  const spam = calculateSpamScore({ subject, text, html, from, replyTo: req.body?.replyTo || '' });
  const senderDomain = from && from.includes('@') ? from.split('@')[1].toLowerCase().trim() : '';

  try {
    const m = await Message.create({
      address,
      from: from || 'unknown',
      replyTo: req.body?.replyTo || '',
      subject,
      text,
      html,
      size: byteSize,
      attachments,
      codes,
      links,
      spamScore: spam.score,
      isSpam: spam.isSpam,
      phishingWarning: spam.phishingWarning || null,
      expiresAt: b.expiresAt,
    });

    await recordStat({
      type: 'received',
      senderDomain,
      country: req.headers['cf-ipcountry'],
      hour: new Date().getUTCHours(),
    });

    mailboxEvents.emit(`message:${address}`, m);
    res.json({ ok: true, id: m._id });
  } catch (err) {
    recordFailure({
      type: 'inbound',
      error: err.message || String(err),
      source: 'inbound-webhook',
      ip: clientIp,
    });
    res.status(500).json({ error: 'Internal inbound processing error' });
  }
});

// Report message (Item 19)
r.post('/mailbox/:address/messages/:id/report', async (req, res) => {
  const address = String(req.params.address).toLowerCase().trim();
  const b = await box(address);
  if (!b) return res.status(404).json({ error: 'Mailbox not found' });
  const providedToken = req.headers['x-mailbox-token'] || req.query?.token;
  if (!verifyMailboxToken(b, providedToken)) return res.status(401).json({ error: 'Valid mailbox token required' });

  const msg = await Message.findOne({ _id: req.params.id, address }).lean();
  if (!msg) return res.status(404).json({ error: 'Message not found' });

  const reason = String(req.body?.reason || 'Spam or malicious email').trim().slice(0, 300);
  const rep = await Report.create({
    messageId: msg._id,
    address,
    from: msg.from,
    subject: msg.subject,
    reason,
    ip: req.headers['cf-connecting-ip'] || req.ip,
  });

  res.json({ ok: true, reportId: rep._id });
});

export default r;
