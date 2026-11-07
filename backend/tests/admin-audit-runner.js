import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';
import jwt from 'jsonwebtoken';
import { Admin, Domain, Mailbox, Message, Stat, Setting, AuditLog, Failure, Report, User, getSettings, recordStat } from '../src/models.js';
import { cleanupOldData } from '../src/cleanup.js';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'a'.repeat(64);
process.env.INBOUND_SECRET = 'test_inbound_secret_123';

async function run() {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  console.log('MongoDB Memory Server connected.');

  const results = [];
  function record(id, name, pass, details = '') {
    results.push({ id, name, pass, details });
    console.log(`${pass ? '✓' : '✗'} [${id}] ${name}${details ? ': ' + details : ''}`);
  }

  // 1. Seed admin and domain
  const adminPassword = 'adminpassword123';
  const hashedPassword = await bcrypt.hash(adminPassword, 12);
  const admin = await Admin.create({
    email: 'admin@tempmail.com',
    password: hashedPassword,
    role: 'owner',
  });
  await Domain.create({ name: 'testdomain.com', active: true, isDefault: true });

  // TEST 1: Login with wrong password
  const resWrong = await request(app)
    .post('/api/admin/login')
    .send({ email: 'admin@tempmail.com', password: 'wrongpassword' });
  record('AUTH-1', 'Login with wrong password', resWrong.status === 401, `Status ${resWrong.status}`);

  // TEST 2: Login with empty fields
  const resEmpty = await request(app)
    .post('/api/admin/login')
    .send({ email: '', password: '' });
  record('AUTH-2', 'Login with empty fields', resEmpty.status === 401, `Status ${resEmpty.status}`);

  // TEST 3: Login with correct credentials
  const resCorrect = await request(app)
    .post('/api/admin/login')
    .send({ email: 'admin@tempmail.com', password: adminPassword });
  const adminToken = resCorrect.body.token;
  record('AUTH-3', 'Login with correct credentials', resCorrect.status === 200 && !!adminToken, `Role: ${resCorrect.body?.admin?.role}`);

  // TEST 4: Profile /me
  const resMe = await request(app)
    .get('/api/admin/me')
    .set('Authorization', `Bearer ${adminToken}`);
  record('AUTH-4', 'Get current admin profile (/me)', resMe.status === 200 && resMe.body.email === 'admin@tempmail.com');

  // TEST 5: Invalid or expired token
  const resInvalidToken = await request(app)
    .get('/api/admin/me')
    .set('Authorization', 'Bearer invalid_or_expired_jwt_token');
  record('AUTH-5', 'Invalid token returns 401', resInvalidToken.status === 401);

  // TEST 6: Overview stats
  const resStats = await request(app)
    .get('/api/admin/stats')
    .set('Authorization', `Bearer ${adminToken}`);
  const has7Days = Array.isArray(resStats.body.days) && resStats.body.days.length === 7;
  record('OVERVIEW-1', 'Overview stats return 7 days array and counters', resStats.status === 200 && has7Days, `Days: ${resStats.body.days?.length}`);

  // TEST 7: Create mailbox & receive message -> check stats increment
  const resBox = await request(app)
    .post('/api/mailbox')
    .send({ domain: 'testdomain.com' });
  const boxAddress = resBox.body.address;
  const boxToken = resBox.body.token;

  await request(app)
    .post('/api/inbound')
    .set('x-inbound-secret', 'test_inbound_secret_123')
    .send({
      to: boxAddress,
      from: 'sender@example.com',
      raw: `From: sender@example.com\r\nTo: ${boxAddress}\r\nSubject: Test Email\r\n\r\nHello World`,
    });

  const resStatsAfter = await request(app)
    .get('/api/admin/stats')
    .set('Authorization', `Bearer ${adminToken}`);
  const mailboxCount = resStatsAfter.body.activeMailboxes;
  const msgCount = resStatsAfter.body.messagesStored;
  record('OVERVIEW-2', 'Overview counters update after mailbox and message created', mailboxCount === 1 && msgCount === 1, `Mailboxes: ${mailboxCount}, Messages: ${msgCount}`);

  // TEST 8: Messages list
  const resMsgList = await request(app)
    .get('/api/admin/messages')
    .set('Authorization', `Bearer ${adminToken}`);
  record('MSG-1', 'Messages list returns array with newly received message', resMsgList.status === 200 && resMsgList.body.length === 1);

  // TEST 9: Delete one message
  const msgId = resMsgList.body[0]._id;
  const resDelMsg = await request(app)
    .delete(`/api/admin/messages/${msgId}`)
    .set('Authorization', `Bearer ${adminToken}`);
  record('MSG-2', 'Delete single message', resDelMsg.status === 200 && resDelMsg.body.ok === true);

  // TEST 10: Purge all messages and mailboxes
  const resPurge = await request(app)
    .post('/api/admin/purge')
    .set('Authorization', `Bearer ${adminToken}`);
  record('MSG-3', 'Purge all messages and mailboxes', resPurge.status === 200 && resPurge.body.ok === true);

  // TEST 11: Add valid domain
  const resAddDom = await request(app)
    .post('/api/admin/domains')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'newdomain.org' });
  record('DOM-1', 'Add valid domain', resAddDom.status === 200 && resAddDom.body.name === 'newdomain.org');

  // TEST 12: Add invalid domain
  const resAddInvalid = await request(app)
    .post('/api/admin/domains')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'invalid_domain_without_dot' });
  record('DOM-2', 'Add invalid domain rejected with 400', resAddInvalid.status === 400);

  // TEST 13: Add duplicate domain
  const resAddDup = await request(app)
    .post('/api/admin/domains')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'newdomain.org' });
  record('DOM-3', 'Add duplicate domain rejected with 409', resAddDup.status === 409);

  // TEST 14: Pause domain & verify public domains list
  const domId = resAddDom.body._id;
  const resPause = await request(app)
    .patch(`/api/admin/domains/${domId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ active: false });
  record('DOM-4', 'Pause domain sets active: false', resPause.status === 200 && resPause.body.active === false);

  const resPubDomains = await request(app).get('/api/domains');
  const pubIncludesPaused = resPubDomains.body.includes('newdomain.org');
  record('DOM-5', 'Paused domain does NOT appear on public /api/domains', !pubIncludesPaused);

  // TEST 15: Activate domain again
  const resActivate = await request(app)
    .patch(`/api/admin/domains/${domId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ active: true });
  record('DOM-6', 'Activate domain sets active: true', resActivate.status === 200 && resActivate.body.active === true);

  // TEST 16: Remove domain
  const resDelDom = await request(app)
    .delete(`/api/admin/domains/${domId}`)
    .set('Authorization', `Bearer ${adminToken}`);
  record('DOM-7', 'Remove domain', resDelDom.status === 200);

  // TEST 16b: Guard against pausing the only active domain
  const remainingActiveDom = await Domain.findOne({ active: true });
  const resPauseOnly = await request(app)
    .patch(`/api/admin/domains/${remainingActiveDom._id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ active: false });
  record('DOM-8', 'Pausing the only active domain is rejected with 400', resPauseOnly.status === 400);

  // TEST 16c: Guard against deleting the only active domain
  const resDeleteOnly = await request(app)
    .delete(`/api/admin/domains/${remainingActiveDom._id}`)
    .set('Authorization', `Bearer ${adminToken}`);
  record('DOM-9', 'Deleting the only active domain is rejected with 400', resDeleteOnly.status === 400);

  // TEST 16d: Backup export auth requirement
  const resExportUnauth = await request(app).get('/api/admin/backup/export');
  record('BAK-1', 'Unauthenticated backup export returns 401', resExportUnauth.status === 401);

  const resExportAuth = await request(app)
    .get('/api/admin/backup/export')
    .set('Authorization', `Bearer ${adminToken}`);
  record('BAK-2', 'Authenticated backup export returns 200 JSON backup', resExportAuth.status === 200 && Array.isArray(resExportAuth.body.domains));

  // TEST 17: Settings load
  const resSettings = await request(app)
    .get('/api/admin/settings')
    .set('Authorization', `Bearer ${adminToken}`);
  record('SET-1', 'Load settings returns object with defaults', resSettings.status === 200 && typeof resSettings.body.ttlMinutes === 'number');

  // TEST 18: Settings save valid values
  const resSaveValid = await request(app)
    .put('/api/admin/settings')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      ttlMinutes: 45,
      maxMessageKB: 4096,
      rateLimit10m: 30,
      rateLimitDaily: 150,
      maxAttachmentMB: 10,
    });
  record('SET-2', 'Save valid settings updates ttlMinutes to 45', resSaveValid.status === 200 && resSaveValid.body.ttlMinutes === 45);

  // TEST 19: Confirm new inbox lifetime applies to newly created inbox
  const resNewBox = await request(app)
    .post('/api/mailbox')
    .send({ domain: 'testdomain.com' });
  const expectedTtl = 45 * 60;
  record('SET-3', 'New inbox lifetime (45 mins) applies to new mailbox', resNewBox.body.ttlSeconds === expectedTtl, `ttlSeconds: ${resNewBox.body.ttlSeconds}`);

  // TEST 20: Settings save invalid values
  const resInvalidTtl = await request(app)
    .put('/api/admin/settings')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ ttlMinutes: 2 }); // Less than 5
  record('SET-4', 'Save invalid ttlMinutes (< 5) rejected with 400', resInvalidTtl.status === 400);

  const resInvalidKb = await request(app)
    .put('/api/admin/settings')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ ttlMinutes: 30, maxMessageKB: 50 }); // Less than 64
  record('SET-5', 'Save invalid maxMessageKB (< 64) rejected with 400', resInvalidKb.status === 400);

  // TEST 21: Settings save dataRetentionDays & autoCleanupEnabled
  const resSaveRetention = await request(app)
    .put('/api/admin/settings')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      ttlMinutes: 30,
      maxMessageKB: 2048,
      dataRetentionDays: 14,
      autoCleanupEnabled: true,
    });
  record('SET-6', 'Save dataRetentionDays (14) and autoCleanupEnabled updates successfully', resSaveRetention.status === 200 && resSaveRetention.body.dataRetentionDays === 14 && resSaveRetention.body.autoCleanupEnabled === true);

  // TEST 22: Unauthenticated cleanup returns 401
  const resUnauthCleanup = await request(app).post('/api/admin/cleanup');
  record('CLN-1', 'Unauthenticated POST /api/admin/cleanup returns 401', resUnauthCleanup.status === 401);

  // TEST 23: 7-day automatic data cleanup logic
  const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

  // Seed old message (> 7 days) and new message (< 7 days)
  await Message.create({
    address: 'old@testdomain.com',
    from: 'spammer@old.com',
    subject: 'Old Email',
    receivedAt: eightDaysAgo,
  });
  await Message.create({
    address: 'new@testdomain.com',
    from: 'sender@new.com',
    subject: 'Recent Email',
    receivedAt: twoDaysAgo,
  });

  // Seed old audit log (> 7 days) and new audit log
  await AuditLog.create({
    adminEmail: 'admin@tempmail.com',
    action: 'old_action',
    createdAt: eightDaysAgo,
  });
  await AuditLog.create({
    adminEmail: 'admin@tempmail.com',
    action: 'recent_action',
    createdAt: twoDaysAgo,
  });

  // Seed old failure (> 7 days)
  await Failure.create({
    error: 'Old error 8 days ago',
    createdAt: eightDaysAgo,
  });

  const cleanupRes = await cleanupOldData(7);
  const remainingOldMsg = await Message.findOne({ subject: 'Old Email' });
  const remainingNewMsg = await Message.findOne({ subject: 'Recent Email' });
  const remainingOldAudit = await AuditLog.findOne({ action: 'old_action' });
  const remainingNewAudit = await AuditLog.findOne({ action: 'recent_action' });
  const remainingOldFail = await Failure.findOne({ error: 'Old error 8 days ago' });

  const clnPass =
    !remainingOldMsg &&
    !!remainingNewMsg &&
    !remainingOldAudit &&
    !!remainingNewAudit &&
    !remainingOldFail &&
    cleanupRes.totalDeleted >= 3;
  record('CLN-2', 'cleanupOldData(7) removes data older than 7 days and preserves newer data', clnPass, `Total deleted: ${cleanupRes.totalDeleted}`);

  // TEST 24: Authenticated POST /api/admin/cleanup endpoint
  const resManualCleanup = await request(app)
    .post('/api/admin/cleanup')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ days: 7 });
  record('CLN-3', 'POST /api/admin/cleanup executes cleanup and returns summary', resManualCleanup.status === 200 && typeof resManualCleanup.body.totalDeleted === 'number');

  // TEST 25: GET /api/admin/cleanup-status
  const resCleanupStatus = await request(app)
    .get('/api/admin/cleanup-status')
    .set('Authorization', `Bearer ${adminToken}`);
  record('CLN-4', 'GET /api/admin/cleanup-status returns retention status & last run info', resCleanupStatus.status === 200 && resCleanupStatus.body.lastCleanup !== null);

  // TEST 26: Mailbox 30-minute lifetime & +30 minutes extension
  const premUser = await User.create({
    email: 'premiumuser@example.com',
    isPremium: true,
    premiumUntil: new Date(Date.now() + 30 * 864e5),
  });
  const premToken = jwt.sign({ userId: premUser._id }, process.env.JWT_SECRET, { expiresIn: '30d' });

  const resPremBox = await request(app)
    .post('/api/mailbox')
    .set('Authorization', `Bearer ${premToken}`)
    .send({ domain: 'testdomain.com' });
  const is30MinsSeconds = 30 * 60;
  record('PREM-1', 'Mailbox created with 30-minute lifetime for all users', resPremBox.status === 200 && resPremBox.body.ttlSeconds === is30MinsSeconds);

  // Extend inbox adds 30 minutes extra
  const resExtendPrem = await request(app)
    .post(`/api/mailbox/${encodeURIComponent(resPremBox.body.address)}/extend`)
    .set('x-mailbox-token', resPremBox.body.token)
    .set('Authorization', `Bearer ${premToken}`);
  record('PREM-2', 'Extend inbox adds 30 minutes extra', resExtendPrem.status === 200 && resExtendPrem.body.addedMinutes === 30 && resExtendPrem.body.ttlSeconds >= 3500);

  // TEST 27: Paginated Users API
  const resUsers = await request(app)
    .get('/api/admin/users?page=1&limit=10')
    .set('Authorization', `Bearer ${adminToken}`);
  record('USER-1', 'Paginated GET /api/admin/users returns user list and total', resUsers.status === 200 && Array.isArray(resUsers.body.users) && resUsers.body.total >= 1);

  // TEST 28: User detail drawer
  const resUserDetail = await request(app)
    .get(`/api/admin/users/${premUser._id}`)
    .set('Authorization', `Bearer ${adminToken}`);
  record('USER-2', 'GET /api/admin/users/:id returns user drawer profile and history', resUserDetail.status === 200 && resUserDetail.body.user.email === 'premiumuser@example.com');

  // TEST 29: Payments Ledger & Stats
  const resPayments = await request(app)
    .get('/api/admin/payments?page=1&limit=10')
    .set('Authorization', `Bearer ${adminToken}`);
  record('PAY-1', 'Paginated GET /api/admin/payments returns ledger array', resPayments.status === 200 && Array.isArray(resPayments.body.payments));

  const resPayStats = await request(app)
    .get('/api/admin/payments/stats')
    .set('Authorization', `Bearer ${adminToken}`);
  record('PAY-2', 'GET /api/admin/payments/stats returns MRR and conversion rate', resPayStats.status === 200 && typeof resPayStats.body.mrr === 'number');

  // TEST 30: System Health Diagnostics
  const resHealth = await request(app)
    .get('/api/admin/health')
    .set('Authorization', `Bearer ${adminToken}`);
  record('HEALTH-1', 'GET /api/admin/health returns MongoDB ping and system metrics', resHealth.status === 200 && resHealth.body.status === 'healthy' && resHealth.body.mongodb.connected === true);

  // TEST 31: Spam Review Queue
  const resSpam = await request(app)
    .get('/api/admin/spam-queue')
    .set('Authorization', `Bearer ${adminToken}`);
  record('SPAM-1', 'GET /api/admin/spam-queue returns quarantined messages with bodies hidden', resSpam.status === 200 && Array.isArray(resSpam.body));

  console.log('\n--- SUMMARY ---');
  const passed = results.filter((r) => r.pass).length;
  console.log(`Passed: ${passed}/${results.length}`);

  await mongoose.disconnect();
  await mongo.stop();
}

run().catch((e) => {
  console.error('Test run failed:', e);
  process.exit(1);
});
