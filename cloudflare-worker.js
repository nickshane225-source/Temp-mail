/**
 * Cloudflare Email Worker for TempMail
 *
 * Forwards incoming emails to the TempMail backend inbound webhook.
 * All email parsing (including MIME and attachments) is performed by the backend.
 *
 * Deployment options:
 * 1. Cloudflare Dashboard:
 *    - In Workers & Pages, open your Worker (e.g. bold-moon-78fb).
 *    - Paste the entire contents of this file into the Worker editor.
 *    - Under Settings -> Variables, you can configure (optional if using defaults):
 *      BACKEND_URL: https://temp-mail-lx1t.onrender.com
 *      INBOUND_SECRET: tempmail_secret_2026
 *    - Click "Save and Deploy".
 *
 * 2. Setup in Email Routing:
 *    - Go to your domain in Cloudflare -> Email Routing -> Routing rules.
 *    - Set Catch-all rule action to "Send to a Worker" and select this worker.
 */

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB limit
const DEFAULT_BACKEND_URL = 'https://temp-mail-lx1t.onrender.com';
const DEFAULT_INBOUND_SECRET = 'tempmail_secret_2026';

export default {
  // 1. Handle incoming Email Routing events
  async email(message, env, ctx) {
    if (message.rawSize && message.rawSize > MAX_BYTES) {
      message.setReject('Message size exceeds 10 MB limit');
      return;
    }

    let raw;
    try {
      raw = await new Response(message.raw).text();
    } catch {
      message.setReject('Temporary delivery failure, try again later');
      return;
    }

    if (raw.length > MAX_BYTES) {
      message.setReject('Message size exceeds 10 MB limit');
      return;
    }

    const backendUrl = (env?.BACKEND_URL || DEFAULT_BACKEND_URL).replace(/\/+$/, '');
    const inboundSecret = env?.INBOUND_SECRET || DEFAULT_INBOUND_SECRET;

    try {
      const response = await fetch(`${backendUrl}/api/inbound`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-inbound-secret': inboundSecret,
        },
        body: JSON.stringify({
          to: message.to,
          from: message.from,
          raw,
        }),
      });

      if (!response.ok) {
        if (response.status === 404) {
          message.setReject('Mailbox does not exist');
        } else {
          message.setReject('Temporary delivery failure, try again later');
        }
      }
    } catch (err) {
      message.setReject('Temporary delivery failure, try again later');
    }
  },

  // 2. Handle HTTP fetch requests (Eliminates Cloudflare "No fetch handler!" error and provides status preview)
  async fetch(request, env, ctx) {
    const backendUrl = (env?.BACKEND_URL || DEFAULT_BACKEND_URL).replace(/\/+$/, '');
    const hasSecret = Boolean(env?.INBOUND_SECRET || DEFAULT_INBOUND_SECRET);

    return new Response(
      JSON.stringify(
        {
          status: 'online',
          service: 'TempMail Cloudflare Email Worker',
          backend: backendUrl,
          secretConfigured: hasSecret,
          message: 'Worker is active and listening for incoming email routing events.',
          timestamp: new Date().toISOString(),
        },
        null,
        2
      ),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  },
};
