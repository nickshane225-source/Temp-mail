import mongoose from 'mongoose';
const { Schema, model } = mongoose;

export const Domain = model('Domain', new Schema({
  name: { type: String, unique: true, lowercase: true, trim: true },
  active: { type: Boolean, default: true },
  isDefault: { type: Boolean, default: false },
  status: { type: String, enum: ['Healthy', 'Warning', 'Failing', 'Unknown'], default: 'Unknown' },
  statusReason: { type: String, default: 'Not checked yet' },
  lastCheckedAt: { type: Date },
}, { timestamps: true }));

export const Mailbox = model('Mailbox', new Schema({
  address: { type: String, unique: true, lowercase: true },
  domain: String,
  tokenHash: { type: String }, // SHA-256 hash of private inbox secret token
  passwordHash: { type: String, default: null },
  isLocked: { type: Boolean, default: false },
  expiresAt: { type: Date, index: { expires: 0 } }, // MongoDB removes it automatically
}, { timestamps: true }));

export const Message = model('Message', new Schema({
  address: { type: String, index: true },
  from: String,
  replyTo: String,
  subject: String,
  text: String,
  html: String,
  size: Number,
  attachments: { type: Schema.Types.Mixed, default: [] },
  codes: { type: [String], default: [] },
  links: [{ url: String, text: String }],
  spamScore: { type: Number, default: 0 },
  isSpam: { type: Boolean, default: false },
  phishingWarning: { type: Schema.Types.Mixed, default: null },
  receivedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, index: { expires: 0 } },
}));

export const Stat = model('Stat', new Schema({
  day: { type: String, unique: true },
  received: { type: Number, default: 0 },
  mailboxes: { type: Number, default: 0 },
  senderDomains: { type: Map, of: Number, default: () => new Map() },
  countries: { type: Map, of: Number, default: () => new Map() },
  hours: { type: [Number], default: () => new Array(24).fill(0) },
}));

export const Setting = model('Setting', new Schema({
  key: { type: String, unique: true },
  value: Schema.Types.Mixed,
}));

export const Admin = model('Admin', new Schema({
  email: { type: String, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['owner', 'moderator', 'billing_only', 'read_only'], default: 'owner' },
  disabled: { type: Boolean, default: false },
  totpSecret: String,
  totpEnabled: { type: Boolean, default: false },
  backupCodes: [String], // Hashed backup codes
  sessions: [{
    sessionId: String,
    ip: String,
    country: String,
    userAgent: String,
    createdAt: { type: Date, default: Date.now },
    lastActiveAt: { type: Date, default: Date.now },
  }],
  loginHistory: [{
    ip: String,
    country: String,
    userAgent: String,
    success: Boolean,
    timestamp: { type: Date, default: Date.now },
  }],
}, { timestamps: true }));

export const SharedLink = model('SharedLink', new Schema({
  token: { type: String, unique: true, index: true },
  messageId: { type: Schema.Types.ObjectId, ref: 'Message', required: true },
  address: { type: String, required: true },
  expiresAt: { type: Date, index: { expires: 0 } },
}, { timestamps: true }));

export const User = model('User', new Schema({
  email: { type: String, unique: true, lowercase: true, trim: true, required: true },
  password: { type: String },
  firebaseUid: { type: String, sparse: true },
  isPremium: { type: Boolean, default: false },
  premiumUntil: { type: Date },
  status: { type: String, enum: ['active', 'suspended', 'banned'], default: 'active' },
  suspendedReason: String,
  suspendedAt: Date,
  tokenRevokedAt: Date,
  lastLoginAt: Date,
  lastLoginIp: String,
  stripeCustomerId: String,
  stripeSubscriptionId: String,
  nowpaymentsPaymentId: String,
  apiKeys: [{
    keyId: String,
    name: String,
    keyHash: String,
    prefix: String,
    createdAt: { type: Date, default: Date.now },
    lastUsedAt: Date,
  }],
}, { timestamps: true }));

export const Payment = model('Payment', new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  userEmail: { type: String, lowercase: true, trim: true },
  provider: { type: String, enum: ['nowpayments', 'stripe', 'manual'], default: 'nowpayments' },
  orderId: { type: String, index: true },
  paymentId: { type: String, index: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'USD' },
  status: { type: String, enum: ['waiting', 'confirming', 'confirmed', 'sending', 'finished', 'failed', 'refunded', 'expired'], default: 'waiting' },
  payAddress: String,
  payCurrency: String,
  actuallyPaid: Number,
  durationDays: { type: Number, default: 30 },
  premiumGranted: { type: Boolean, default: false },
  reconciled: { type: Boolean, default: false },
  reconciledBy: String,
  reconciledAt: Date,
  reconcileNote: String,
  rawWebhook: Schema.Types.Mixed,
}, { timestamps: true }));

export const WebhookLog = model('WebhookLog', new Schema({
  provider: { type: String, enum: ['nowpayments', 'stripe'], required: true },
  event: String,
  status: { type: String, enum: ['processed', 'rejected', 'duplicate', 'failed'], default: 'processed' },
  signature: String,
  ip: String,
  payload: Schema.Types.Mixed,
  error: String,
}, { timestamps: true }));

export const Post = model('Post', new Schema({
  title: { type: String, required: true },
  slug: { type: String, unique: true, lowercase: true, trim: true, required: true },
  body: { type: String, required: true },
  metaDescription: { type: String, default: '' },
  published: { type: Boolean, default: false },
  author: { type: String, default: 'TempMail Team' },
  coverImage: { type: String, default: '' },
  tags: { type: [String], default: [] },
  isAutoGenerated: { type: Boolean, default: false },
  expiresAt: { type: Date, default: null },
}, { timestamps: true }));

// Phase 5: Abuse Blocklist (sender domain, address, or IP)
export const Blocklist = model('Blocklist', new Schema({
  type: { type: String, enum: ['domain', 'address', 'ip'], required: true },
  value: { type: String, lowercase: true, trim: true, required: true },
  reason: { type: String, default: '' },
  isWildcard: { type: Boolean, default: false },
  hitCount: { type: Number, default: 0 },
  lastHitAt: Date,
}, { timestamps: true }));

// Phase 5: Message Abuse Reports
export const Report = model('Report', new Schema({
  messageId: { type: Schema.Types.ObjectId, ref: 'Message' },
  address: { type: String, required: true },
  from: { type: String, default: '' },
  subject: { type: String, default: '' },
  reason: { type: String, default: 'Spam or malicious email' },
  ip: { type: String, default: '' },
  resolved: { type: Boolean, default: false },
}, { timestamps: true }));

// Phase 5: Audit Log for Admin Actions
export const AuditLog = model('AuditLog', new Schema({
  adminId: { type: Schema.Types.ObjectId, ref: 'Admin' },
  adminEmail: { type: String, required: true },
  action: { type: String, required: true },
  details: { type: Schema.Types.Mixed, default: {} },
  ip: { type: String, default: '' },
}, { timestamps: true }));

// Phase 5: Failure Logging for Monitoring & Alerts
export const Failure = model('Failure', new Schema({
  type: { type: String, enum: ['inbound', 'smtp', 'unhandled'], default: 'unhandled' },
  error: { type: String, required: true },
  source: { type: String, default: '' },
  details: { type: Schema.Types.Mixed, default: {} },
  ip: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now, index: { expires: '30d' } },
}));

// Helper to record detailed stats (Item 18)
export async function recordStat({ type = 'received', senderDomain, country, hour = new Date().getUTCHours() } = {}) {
  const day = new Date().toISOString().slice(0, 10);
  const update = { $inc: { [type]: 1 } };

  if (typeof hour === 'number' && hour >= 0 && hour <= 23) {
    update.$inc[`hours.${hour}`] = 1;
  }
  if (senderDomain) {
    const cleanDomain = String(senderDomain).toLowerCase().replace(/[^a-z0-9_-]/gi, '_');
    update.$inc[`senderDomains.${cleanDomain}`] = 1;
  }
  if (country) {
    const cleanCountry = String(country).toUpperCase().slice(0, 2);
    update.$inc[`countries.${cleanCountry}`] = 1;
  }

  await Stat.updateOne({ day }, update, { upsert: true });
}

export const bump = (field) => recordStat({ type: field });

export const DEFAULT_RESERVED_NAMES = [
  'admin', 'support', 'root', 'postmaster', 'abuse', 'info',
  'security', 'webmaster', 'help', 'contact', 'billing', 'mail',
  'system', 'master', 'noreply', 'no-reply'
];

export async function getSettings() {
  const s = {
    ttlMinutes: 30,
    maxMessageKB: 2048,
    rateLimit10m: 20,
    rateLimitDaily: 100,
    maxAttachmentMB: 5,
    reservedNames: DEFAULT_RESERVED_NAMES,
    adsEnabled: true,
    adsensePublisherId: 'pub-1052993488526571',
    adsTxt: 'google.com, pub-1052993488526571, DIRECT, f08c47fec0942fa0\n',
    googleAnalyticsId: 'G-E3TY5VJGNF',
    adHeader: '',
    adBelowCard: '',
    adSidebar: '',
    autoPauseFailingDomains: false,
    defaultDomain: '',
    dataRetentionDays: 7,
    autoCleanupEnabled: true,
    geminiApiKey: '',
    geminiAutoBlogEnabled: true,
    geminiAutoBlogIntervalHours: 24,
    geminiModel: 'gemini-3.8-flash',
    geminiImageModel: 'gemini-3-pro-image',
    lastAutoBlogRun: null,
    maintenanceMode: false,
    featureFlags: { ads: false, premiumSignup: true, apiAccess: true, userRegistration: true },
    announcementBanner: { enabled: false, message: '', type: 'info' },
    telegramWebhookUrl: '',
    ipAllowlist: [],
  };
  (await Setting.find().lean()).forEach((r) => (s[r.key] = r.value));
  return s;
}
