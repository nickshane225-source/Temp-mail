import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';
import { Mailbox, Message, recordStat, getSettings } from './models.js';
import { mailboxEvents } from './events.js';
import { extractVerificationDetails } from './utils/extractors.js';
import { processAttachments } from './utils/gridfs.js';
import { isSenderBlocked } from './utils/blocklist.js';
import { calculateSpamScore } from './utils/spamScore.js';
import { recordFailure } from './utils/monitoring.js';

export async function startSmtp(port) {
  const { maxMessageKB } = await getSettings();
  const hasCert = Boolean(process.env.SMTP_KEY && process.env.SMTP_CERT);

  const server = new SMTPServer({
    authOptional: true,
    disabledCommands: hasCert ? ['AUTH'] : ['AUTH', 'STARTTLS'],
    hideSTARTTLS: !hasCert,
    key: process.env.SMTP_KEY || undefined,
    cert: process.env.SMTP_CERT || undefined,
    size: (maxMessageKB || 2048) * 1024,
    banner: 'TempMail',
    async onMailFrom(address, session, cb) {
      try {
        const fromAddr = address.address?.toLowerCase();
        const blocked = await isSenderBlocked({ from: fromAddr, ip: session.remoteAddress });
        if (blocked) {
          const err = new Error(`Sender blocked by administrative policy: ${blocked.reason || blocked.value}`);
          err.responseCode = 554;
          return cb(err);
        }
        cb();
      } catch (err) {
        cb();
      }
    },
    onRcptTo(addr, session, cb) {
      const address = (addr.address || '').replace(/^<|>$/g, '').toLowerCase().trim();
      Mailbox.findOne({ address })
        .then((box) => {
          if (box && (!box.expiresAt || box.expiresAt > new Date())) return cb();
          const e = new Error('Mailbox not found');
          e.responseCode = 550;
          cb(e);
        })
        .catch(cb);
    },
    async onData(stream, session, cb) {
      try {
        const mail = await simpleParser(stream);
        if (stream.sizeExceeded) {
          const e = new Error('Message too large');
          e.responseCode = 552;
          return cb(e);
        }

        const from = mail.from?.text || session.envelope.mailFrom?.address || 'unknown';
        const fromEmail = mail.from?.value?.[0]?.address || session.envelope.mailFrom?.address || from;
        const replyTo = mail.replyTo?.text || mail.replyTo?.value?.[0]?.address || '';

        // Check blocklist again on full parsed address
        const blocked = await isSenderBlocked({ from: fromEmail, ip: session.remoteAddress });
        if (blocked) {
          const e = new Error('Sender blocked by administrative policy');
          e.responseCode = 554;
          return cb(e);
        }

        const subject = mail.subject || '(no subject)';
        const text = mail.text || '';
        let html = mail.html || '';

        // Inline embedded CID images (e.g. logos, headers) directly into HTML so they render cleanly in browsers
        if (html && Array.isArray(mail.attachments)) {
          for (const att of mail.attachments) {
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
        const { maxAttachmentMB } = await getSettings();

        // Calculate spam score
        const spam = calculateSpamScore({ subject, text, html, from: fromEmail, replyTo });
        const senderDomain = fromEmail.includes('@') ? fromEmail.split('@')[1] : '';

        for (const r of session.envelope.rcptTo) {
          const address = (r.address || '').replace(/^<|>$/g, '').toLowerCase().trim();
          const box = await Mailbox.findOne({ address });
          if (!box || (box.expiresAt && box.expiresAt <= new Date())) continue;

          const attachments = await processAttachments(mail.attachments || [], {
            address,
            expiresAt: box.expiresAt,
            maxAttachmentMB: maxAttachmentMB || 5,
          });

          const msg = await Message.create({
            address,
            from,
            replyTo,
            subject,
            text,
            html,
            size: stream.byteLength || 0,
            attachments,
            codes,
            links,
            spamScore: spam.score,
            isSpam: spam.isSpam,
            phishingWarning: spam.phishingWarning || null,
            expiresAt: box.expiresAt,
          });

          await recordStat({
            type: 'received',
            senderDomain,
            hour: new Date().getUTCHours(),
          });

          mailboxEvents.emit(`message:${address}`, msg);
        }
        cb();
      } catch (e) {
        recordFailure({
          type: 'smtp',
          error: e.message || String(e),
          source: 'smtp.onData',
          ip: session.remoteAddress,
        });
        cb(e);
      }
    },
  });

  server.on('error', (e) => {
    console.error('SMTP error:', e.message);
    recordFailure({ type: 'smtp', error: e.message, source: 'smtp-server.error' });
  });

  server.listen(port, '0.0.0.0', () => console.log(`SMTP listening on ${port}`));
}
