import mongoose from 'mongoose';
import { getGridFSBucket } from './utils/gridfs.js';
import {
  Message,
  Mailbox,
  AuditLog,
  Failure,
  Report,
  Stat,
  SharedLink,
  Setting,
  getSettings,
} from './models.js';

/**
 * Cleanup expired or orphaned attachments from GridFS every 10 minutes.
 * Returns count of deleted files.
 */
export async function cleanupOrphanedGridFSFiles() {
  if (!mongoose.connection.db) return 0;
  let deletedCount = 0;

  try {
    const bucket = getGridFSBucket();
    const filesColl = mongoose.connection.db.collection('attachments.files');
    const now = new Date();

    // 1. Files whose metadata.expiresAt has passed
    const expiredFiles = await filesColl.find({
      'metadata.expiresAt': { $lte: now },
    }).project({ _id: 1 }).toArray();

    for (const f of expiredFiles) {
      try {
        await bucket.delete(f._id);
        deletedCount++;
      } catch {}
    }

    // 2. Orphaned files: files not referenced by any existing message
    const activeMessages = await Message.find({ 'attachments.fileId': { $exists: true } })
      .select('attachments.fileId')
      .lean();

    const activeFileIds = new Set();
    for (const msg of activeMessages) {
      if (Array.isArray(msg.attachments)) {
        for (const att of msg.attachments) {
          if (att.fileId) activeFileIds.add(String(att.fileId));
        }
      }
    }

    const allFiles = await filesColl.find({}).project({ _id: 1 }).toArray();
    for (const f of allFiles) {
      if (!activeFileIds.has(String(f._id))) {
        try {
          await bucket.delete(f._id);
          deletedCount++;
        } catch {}
      }
    }
  } catch (err) {
    console.error('Error during GridFS cleanup:', err.message);
  }
  return deletedCount;
}

/**
 * Cleans up all operational data older than the retention period (default 7 days).
 * Clears:
 * - Messages older than retentionDays or expired
 * - Mailboxes older than retentionDays or expired
 * - Audit logs older than retentionDays
 * - Failure logs older than retentionDays
 * - Abuse reports older than retentionDays
 * - Shared links older than retentionDays or expired
 * - Daily stats older than retentionDays
 * - Orphaned GridFS attachment files
 *
 * Persists the result summary in the Setting collection.
 */
export async function cleanupOldData(retentionDays = 7) {
  const days = Math.max(1, Number(retentionDays) || 7);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const cutoffDayStr = cutoff.toISOString().slice(0, 10);
  const now = new Date();

  // 1. Messages: expired OR unmanaged messages older than cutoff
  const msgRes = await Message.deleteMany({
    $or: [
      { expiresAt: { $lte: now } },
      { receivedAt: { $lte: cutoff }, expiresAt: { $exists: false } },
      { createdAt: { $lte: cutoff }, expiresAt: { $exists: false } },
    ],
  });

  // 2. Mailboxes: expired OR unmanaged mailboxes older than cutoff
  const boxRes = await Mailbox.deleteMany({
    $or: [
      { expiresAt: { $lte: now } },
      { createdAt: { $lte: cutoff }, expiresAt: { $exists: false } },
    ],
  });

  // 3. Audit logs: older than cutoff
  const auditRes = await AuditLog.deleteMany({
    createdAt: { $lte: cutoff },
  });

  // 4. Failures: older than cutoff
  const failRes = await Failure.deleteMany({
    createdAt: { $lte: cutoff },
  });

  // 5. Abuse reports: older than cutoff
  const reportRes = await Report.deleteMany({
    createdAt: { $lte: cutoff },
  });

  // 6. Shared links: older than cutoff or expired
  const linkRes = await SharedLink.deleteMany({
    $or: [
      { createdAt: { $lte: cutoff } },
      { expiresAt: { $lte: now } },
    ],
  });

  // 7. Stats: older than cutoff date
  const statRes = await Stat.deleteMany({
    day: { $lt: cutoffDayStr },
  });

  // 8. GridFS attachments cleanup
  const gridFsCleaned = await cleanupOrphanedGridFSFiles();

  const summary = {
    cleanedAt: new Date().toISOString(),
    retentionDays: days,
    messagesDeleted: msgRes.deletedCount || 0,
    mailboxesDeleted: boxRes.deletedCount || 0,
    auditLogsDeleted: auditRes.deletedCount || 0,
    failuresDeleted: failRes.deletedCount || 0,
    reportsDeleted: reportRes.deletedCount || 0,
    sharedLinksDeleted: linkRes.deletedCount || 0,
    statsDeleted: statRes.deletedCount || 0,
    gridFsCleaned: gridFsCleaned || 0,
    totalDeleted:
      (msgRes.deletedCount || 0) +
      (boxRes.deletedCount || 0) +
      (auditRes.deletedCount || 0) +
      (failRes.deletedCount || 0) +
      (reportRes.deletedCount || 0) +
      (linkRes.deletedCount || 0) +
      (statRes.deletedCount || 0),
  };

  try {
    await Setting.updateOne({ key: 'lastDataCleanup' }, { value: summary }, { upsert: true });
  } catch (err) {
    console.error('Failed to save lastDataCleanup setting:', err.message);
  }

  return summary;
}

export function startGridFSCleanupJob() {
  // Run every 10 minutes
  const timer = setInterval(cleanupOrphanedGridFSFiles, 10 * 60 * 1000);
  if (timer.unref) timer.unref();
  return timer;
}

/**
 * Starts the automatic data retention cleanup job.
 * Runs an initial cleanup 5 seconds after startup, then runs periodically every hour.
 */
export function startAutoCleanupJob() {
  const run = async () => {
    try {
      const settings = await getSettings();
      if (settings.autoCleanupEnabled !== false) {
        const days = Number(settings.dataRetentionDays) || 7;
        const summary = await cleanupOldData(days);
        if (summary.totalDeleted > 0) {
          console.log(`[Auto-Cleanup] Successfully cleared ${summary.totalDeleted} items older than ${days} days.`);
        }
      }
    } catch (err) {
      console.error('[Auto-Cleanup] Error during automated data cleanup:', err.message);
    }
  };

  // Initial run after startup
  const initialTimeout = setTimeout(run, 5000);
  if (initialTimeout.unref) initialTimeout.unref();

  // Hourly recurring job
  const timer = setInterval(run, 60 * 60 * 1000);
  if (timer.unref) timer.unref();
  return timer;
}
