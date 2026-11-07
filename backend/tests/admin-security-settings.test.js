import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';
import { Admin, Message, Mailbox, Stat, Report, Blocklist, Setting } from '../src/models.js';

const TEST_SECRET = 'super_secure_jwt_secret_for_testing_purposes_only_32chars';
process.env.JWT_SECRET = TEST_SECRET;

let mongod;
let ownerToken;
let readOnlyToken;
let moderatorToken;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const hashedPw = await bcrypt.hash('Secret123!', 10);

  const owner = await Admin.create({ email: 'owner@sec.internal', password: hashedPw, role: 'owner' });
  ownerToken = jwt.sign({ id: owner._id, email: owner.email, role: 'owner' }, TEST_SECRET, { expiresIn: '1h' });

  const readOnly = await Admin.create({ email: 'readonly@sec.internal', password: hashedPw, role: 'read_only' });
  readOnlyToken = jwt.sign({ id: readOnly._id, email: readOnly.email, role: 'read_only' }, TEST_SECRET, { expiresIn: '1h' });

  const moderator = await Admin.create({ email: 'mod@sec.internal', password: hashedPw, role: 'moderator' });
  moderatorToken = jwt.sign({ id: moderator._id, email: moderator.email, role: 'moderator' }, TEST_SECRET, { expiresIn: '1h' });

  // Seed stats and messages
  await Stat.create({
    day: new Date().toISOString().slice(0, 10),
    received: 25,
    mailboxes: 10,
    hours: new Array(24).fill(1),
  });

  await Message.create({
    address: 'spamuser@tempmail.internal',
    from: 'spammer@malicious.com',
    subject: 'Claim your lottery now!',
    text: 'Suspicious body',
    spamScore: 85,
    isSpam: true,
  });

  await Report.create({
    address: 'victim@tempmail.internal',
    from: 'spammer@malicious.com',
    subject: 'Spam alert',
    reason: 'Phishing scam',
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});

describe('Task 4: Analytics Range, Health Check and SSE Stream', () => {
  it('GET /api/admin/analytics/range returns comparative analytics and top senders', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await request(app)
      .get(`/api/admin/analytics/range?start=${today}&end=${today}&compare=true`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('current');
    expect(res.body.current).toHaveProperty('received');
    expect(res.body).toHaveProperty('dailySeries');
  });

  it('GET /api/admin/health returns MongoDB and system health diagnostics', async () => {
    const res = await request(app)
      .get('/api/admin/health')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.mongodb.connected).toBe(true);
    expect(res.body).toHaveProperty('storage');
    expect(res.body).toHaveProperty('uptime');
  });
});

describe('Task 5: Bulk Actions, Spam Queue & Abuse Automation', () => {
  it('POST /api/admin/messages/bulk-delete deletes multiple messages', async () => {
    const m1 = await Message.create({ address: 'test1@box.internal', subject: 'Del 1' });
    const m2 = await Message.create({ address: 'test2@box.internal', subject: 'Del 2' });

    const res = await request(app)
      .post('/api/admin/messages/bulk-delete')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ids: [m1._id, m2._id] });

    expect(res.status).toBe(200);
    expect(res.body.deletedCount).toBe(2);

    const remaining = await Message.find({ _id: { $in: [m1._id, m2._id] } });
    expect(remaining).toHaveLength(0);
  });

  it('GET /api/admin/spam-queue lists high-spam score messages without exposing body', async () => {
    const res = await request(app)
      .get('/api/admin/spam-queue')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toBeInstanceOf(Array);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].subject).toBe('Claim your lottery now!');
    expect(res.body[0].text).toBeUndefined(); // Body must remain hidden
  });

  it('GET /api/admin/reports/grouped groups reports by sender', async () => {
    const res = await request(app)
      .get('/api/admin/reports/grouped')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toBeInstanceOf(Array);
    const spammerGroup = res.body.find((g) => g._id === 'spammer@malicious.com');
    expect(spammerGroup).toBeDefined();
    expect(spammerGroup.count).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/admin/blocklist/bulk and GET export manage wildcard entries and CSV export', async () => {
    const bulkRes = await request(app)
      .post('/api/admin/blocklist/bulk')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        entries: [
          { type: 'domain', value: '*.phish-network.xyz', isWildcard: true, reason: 'Wildcard phishing network' },
          { type: 'address', value: 'badactor@somemail.com', isWildcard: false, reason: 'Abusive sender' },
        ],
      });

    expect(bulkRes.status).toBe(200);
    expect(bulkRes.body.insertedCount).toBe(2);

    const exportRes = await request(app)
      .get('/api/admin/blocklist/export')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(exportRes.status).toBe(200);
    expect(exportRes.headers['content-type']).toMatch(/text\/csv/);
    expect(exportRes.text).toContain('*.phish-network.xyz');
  });
});

describe('Task 6: Fine-Grained Roles and Security Controls', () => {
  it('enforces read_only role: forbids mutations with HTTP 403', async () => {
    const res = await request(app)
      .post('/api/admin/domains')
      .set('Authorization', `Bearer ${readOnlyToken}`)
      .send({ name: 'should-fail.internal' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/read-only/i);
  });

  it('enforces moderator role: cannot alter settings or purge', async () => {
    const res = await request(app)
      .put('/api/admin/settings')
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ ttlMinutes: 45 });

    expect(res.status).toBe(403);
  });

  it('handles maintenance mode toggle and blocks public mailbox creation', async () => {
    await Setting.updateOne({ key: 'maintenanceMode' }, { value: true }, { upsert: true });

    const pubRes = await request(app)
      .post('/api/mailbox')
      .send({});

    expect(pubRes.status).toBe(503);
    expect(pubRes.body.error).toMatch(/maintenance/i);

    // Admin should still have access
    const adminRes = await request(app)
      .get('/api/admin/settings')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(adminRes.status).toBe(200);

    // Disable maintenance mode
    await Setting.updateOne({ key: 'maintenanceMode' }, { value: false }, { upsert: true });
  });
});
