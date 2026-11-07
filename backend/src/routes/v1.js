import { Router } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { User, Mailbox, Message, Domain, bump, getSettings } from '../models.js';

const r = Router();

// Per-key rate limit: 60 requests per minute
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.apiKeyPrefix || req.ip,
  message: { error: 'Rate limit exceeded for this API key. Max 60 requests per minute.' },
});

// Middleware to authenticate API keys
async function requireApiKey(req, res, next) {
  const rawKey = req.headers['x-api-key'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!rawKey || typeof rawKey !== 'string') {
    return res.status(401).json({ error: 'API key is required in X-Api-Key or Authorization header.' });
  }

  const keyHash = crypto.createHash('sha256').update(rawKey.trim()).digest('hex');
  const user = await User.findOne({ 'apiKeys.keyHash': keyHash });

  if (!user) {
    return res.status(401).json({ error: 'Invalid API key provided.' });
  }

  const activePremium = user.isPremium && (!user.premiumUntil || new Date(user.premiumUntil) > new Date());
  if (!activePremium) {
    return res.status(403).json({ error: 'The account owning this API key does not have an active Premium subscription.' });
  }

  req.apiKeyUser = user;
  req.apiKeyPrefix = rawKey.slice(0, 7);

  // Update last used timestamp
  User.updateOne(
    { _id: user._id, 'apiKeys.keyHash': keyHash },
    { $set: { 'apiKeys.$.lastUsedAt': new Date() } }
  ).catch(() => {});

  next();
}

r.use(requireApiKey);
r.use(apiLimiter);

// 1. List Domains
r.get('/domains', async (_req, res) => {
  const domains = await Domain.find({ active: true }).select('name').lean();
  res.json({ domains: domains.map((d) => d.name) });
});

// 2. Create Mailbox
r.post('/mailbox', async (req, res) => {
  const domains = await Domain.find({ active: true });
  if (!domains.length) return res.status(503).json({ error: 'No domains are available.' });

  const d = domains.find((x) => x.name === req.body?.domain) || domains[0];
  const { reservedNames } = await getSettings();

  // Premium users get 24-hour inboxes (1440 min)
  const ttlMinutes = 1440;
  let prefix = crypto.randomBytes(8).toString('hex').slice(0, 10);

  if (req.body?.name) {
    const custom = String(req.body.name).toLowerCase().trim();
    if (!/^[a-z0-9._-]{3,30}$/.test(custom)) {
      return res.status(400).json({ error: 'Name must be 3-30 characters (letters, numbers, ., _, -).' });
    }
    if ((reservedNames || []).includes(custom)) {
      return res.status(400).json({ error: 'This custom address name is reserved.' });
    }
    const exists = await Mailbox.exists({ address: `${custom}@${d.name}` });
    if (exists) return res.status(409).json({ error: 'This address is already in use.' });
    prefix = custom;
  }

  const address = `${prefix}@${d.name}`;
  const expiresAt = new Date(Date.now() + ttlMinutes * 60000);
  const rawToken = crypto.randomBytes(24).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  await Mailbox.create({ address, domain: d.name, expiresAt, tokenHash });
  bump('mailboxes');

  res.json({
    address,
    expiresAt,
    ttlSeconds: ttlMinutes * 60,
    token: rawToken,
  });
});

// 3. List Messages for address
r.get('/mailbox/:address/messages', async (req, res) => {
  const address = String(req.params.address).toLowerCase().trim();
  const box = await Mailbox.findOne({ address });
  if (!box) return res.status(404).json({ error: 'Mailbox not found or expired.' });

  const messages = await Message.find({ address })
    .sort({ receivedAt: -1 })
    .select('from subject text receivedAt size attachments codes links')
    .lean();

  res.json({
    address,
    expiresAt: box.expiresAt,
    messages,
  });
});

// 4. Read single message
r.get('/mailbox/:address/messages/:id', async (req, res) => {
  const address = String(req.params.address).toLowerCase().trim();
  const msg = await Message.findOne({ _id: req.params.id, address }).lean().catch(() => null);
  if (!msg) return res.status(404).json({ error: 'Message not found.' });

  res.json(msg);
});

export default r;
