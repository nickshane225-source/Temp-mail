import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { Domain, Mailbox, Message } from '../src/models.js';
import { detectPhishing, calculateSpamScore } from '../src/utils/spamScore.js';

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Domain.create({ name: 'testpriv.internal', active: true });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});

describe('Phase 1: Privacy and Inbox Features', () => {
  it('detects brand impersonation and lookalike phishing domains', () => {
    // 1. Display name spoofing
    const spoof1 = detectPhishing({
      from: '"PayPal Security Team" <admin@hacker-server.xyz>',
      subject: 'Urgent: Account Suspended',
    });
    expect(spoof1).not.toBeNull();
    expect(spoof1.isSuspicious).toBe(true);
    expect(spoof1.type).toBe('brand_impersonation');

    // 2. Homoglyph / typosquatting lookalike
    const spoof2 = detectPhishing({
      from: 'billing@paypa1.com',
      subject: 'Your invoice is ready',
    });
    expect(spoof2).not.toBeNull();
    expect(spoof2.isSuspicious).toBe(true);
    expect(spoof2.type).toBe('lookalike_domain');

    // 3. Legitimate sender
    const legit = detectPhishing({
      from: '"PayPal" <service@paypal.com>',
      subject: 'Receipt for your payment',
    });
    expect(legit).toBeNull();

    // 4. Spam score includes phishing penalty
    const spamResult = calculateSpamScore({
      from: '"Google Support" <help@fake-google-login.com>',
      subject: 'Reset your password now',
    });
    expect(spamResult.score).toBeGreaterThanOrEqual(50);
    expect(spamResult.phishingWarning).not.toBeNull();
  });

  it('supports PIN/password locking and returns 423 when locked', async () => {
    // Create mailbox
    const boxRes = await request(app)
      .post('/api/mailbox')
      .send({ domain: 'testpriv.internal' });
    expect(boxRes.status).toBe(200);
    const { address, token } = boxRes.body;

    // Send a message to this mailbox
    await Message.create({
      address,
      from: 'sender@example.com',
      subject: 'Confidential Secret Email',
      text: 'Top secret information',
      expiresAt: new Date(Date.now() + 3600000),
    });

    // 1. Lock the mailbox with PIN "54321"
    const lockRes = await request(app)
      .post(`/api/mailbox/${encodeURIComponent(address)}/lock`)
      .set('x-mailbox-token', token)
      .send({ password: '54321' });
    expect(lockRes.status).toBe(200);
    expect(lockRes.body.isLocked).toBe(true);

    // 2. Accessing messages without password returns 423 Locked
    const lockedFetch = await request(app)
      .get(`/api/mailbox/${encodeURIComponent(address)}/messages`)
      .set('x-mailbox-token', token);
    expect(lockedFetch.status).toBe(423);
    expect(lockedFetch.body.isLocked).toBe(true);

    // 3. Accessing messages with WRONG password returns 423
    const wrongPassFetch = await request(app)
      .get(`/api/mailbox/${encodeURIComponent(address)}/messages`)
      .set('x-mailbox-token', token)
      .set('x-inbox-password', 'wrongpin');
    expect(wrongPassFetch.status).toBe(423);

    // 4. Accessing messages with CORRECT password returns 200
    const correctPassFetch = await request(app)
      .get(`/api/mailbox/${encodeURIComponent(address)}/messages`)
      .set('x-mailbox-token', token)
      .set('x-inbox-password', '54321');
    expect(correctPassFetch.status).toBe(200);
    expect(correctPassFetch.body.messages.length).toBe(1);

    // 5. Unlock mailbox permanently
    const unlockRes = await request(app)
      .post(`/api/mailbox/${encodeURIComponent(address)}/unlock`)
      .set('x-mailbox-token', token)
      .send({ password: '54321', removeLock: true });
    expect(unlockRes.status).toBe(200);
    expect(unlockRes.body.hasPassword).toBe(false);

    // 6. Accessing without password is now allowed
    const openFetch = await request(app)
      .get(`/api/mailbox/${encodeURIComponent(address)}/messages`)
      .set('x-mailbox-token', token);
    expect(openFetch.status).toBe(200);
  });

  it('exports mailbox messages as an RFC 822 ZIP archive', async () => {
    // Create mailbox
    const boxRes = await request(app)
      .post('/api/mailbox')
      .send({ domain: 'testpriv.internal' });
    const { address, token } = boxRes.body;

    await Message.create({
      address,
      from: 'friend@test.com',
      subject: 'Hello World',
      text: 'Export me please!',
      receivedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
    });

    const exportRes = await request(app)
      .get(`/api/mailbox/${encodeURIComponent(address)}/export`)
      .set('x-mailbox-token', token)
      .responseType('blob');

    expect(exportRes.status).toBe(200);
    expect(exportRes.headers['content-type']).toBe('application/zip');
    expect(exportRes.headers['content-disposition']).toContain(`${address}-export.zip`);
    // PKZip header magic bytes: 'PK\x03\x04'
    const buf = Buffer.from(exportRes.body);
    expect(buf.slice(0, 4).toString('ascii')).toBe('PK\x03\x04');
  });

  it('burns mailbox immediately, deleting all messages and records', async () => {
    // Create mailbox
    const boxRes = await request(app)
      .post('/api/mailbox')
      .send({ domain: 'testpriv.internal' });
    const { address, token } = boxRes.body;

    await Message.create({
      address,
      from: 'burner@test.com',
      subject: 'Burn this now',
      text: 'Destroy everything',
      expiresAt: new Date(Date.now() + 3600000),
    });

    // Check message exists
    const beforeBurn = await Message.find({ address });
    expect(beforeBurn.length).toBe(1);

    // Call burn
    const burnRes = await request(app)
      .post(`/api/mailbox/${encodeURIComponent(address)}/burn`)
      .set('x-mailbox-token', token);
    expect(burnRes.status).toBe(200);
    expect(burnRes.body.success).toBe(true);

    // Verify messages and mailbox are completely gone
    const afterMsgs = await Message.find({ address });
    expect(afterMsgs.length).toBe(0);

    const afterBox = await Mailbox.findOne({ address });
    expect(afterBox).toBeNull();
  });
});
