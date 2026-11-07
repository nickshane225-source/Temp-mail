import mongoose from 'mongoose';
import path from 'path';
import { Readable } from 'stream';

export const DANGEROUS_EXTENSIONS = new Set([
  'exe', 'scr', 'bat', 'cmd', 'com', 'js', 'vbs', 'msi', 'jar',
  'ps1', 'apk', 'vbe', 'wsf', 'wsh', 'hta', 'reg', 'pif', 'sh', 'bin'
]);

export function getGridFSBucket() {
  if (!mongoose.connection.db) {
    throw new Error('Database is not connected');
  }
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: 'attachments',
  });
}

/**
 * Process email attachments:
 * - Drops dangerous extensions and flags them as blocked
 * - Checks max size limit
 * - Stores allowed attachments in GridFS with metadata
 */
export async function processAttachments(rawAttachments = [], { address, expiresAt, maxAttachmentMB = 5 }) {
  if (!Array.isArray(rawAttachments) || rawAttachments.length === 0) {
    return [];
  }

  const maxBytesPerFile = maxAttachmentMB * 1024 * 1024;
  const processed = [];
  const bucket = getGridFSBucket();

  for (const att of rawAttachments) {
    const filename = att.filename || 'attachment.dat';
    const size = att.size || att.content?.length || 0;
    const contentType = att.contentType || 'application/octet-stream';
    const ext = (path.extname(filename) || '').replace(/^\./, '').toLowerCase();

    // Check dangerous extension
    if (DANGEROUS_EXTENSIONS.has(ext)) {
      processed.push({
        filename,
        size,
        contentType,
        blocked: true,
        reason: `Dangerous file type (.${ext}) blocked for security.`,
      });
      continue;
    }

    // Check size limit
    if (size > maxBytesPerFile) {
      processed.push({
        filename,
        size,
        contentType,
        blocked: true,
        reason: `Attachment exceeds maximum size of ${maxAttachmentMB} MB.`,
      });
      continue;
    }

    // Upload content buffer to GridFS
    try {
      const buffer = Buffer.isBuffer(att.content)
        ? att.content
        : Buffer.from(att.content || '');

      const uploadStream = bucket.openUploadStream(filename, {
        metadata: {
          address: address.toLowerCase(),
          expiresAt,
          contentType,
        },
        contentType,
      });

      await new Promise((resolve, reject) => {
        const readable = Readable.from(buffer);
        readable.pipe(uploadStream)
          .on('error', reject)
          .on('finish', resolve);
      });

      processed.push({
        fileId: uploadStream.id,
        filename,
        size: buffer.length,
        contentType,
        blocked: false,
      });
    } catch (err) {
      console.error('Failed to store attachment in GridFS:', err.message);
      processed.push({
        filename,
        size,
        contentType,
        blocked: true,
        reason: 'Failed to process attachment file.',
      });
    }
  }

  return processed;
}
