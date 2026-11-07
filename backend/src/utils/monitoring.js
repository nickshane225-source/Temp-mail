import { Failure } from '../models.js';

let lastAlertTime = 0;
const ALERT_COOLDOWN = 15 * 60 * 1000; // Throttle webhook alerts to once every 15 min

/**
 * Record a failure and trigger an alert if failures spike above threshold
 */
export async function recordFailure({ type = 'unhandled', error = '', source = '', details = {}, ip = '' } = {}) {
  try {
    const errMessage = typeof error === 'string' ? error : (error?.message || String(error));
    await Failure.create({
      type,
      error: errMessage,
      source,
      details,
      ip,
      createdAt: new Date(),
    });

    // Check failures in the last 24 hours
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const count24h = await Failure.countDocuments({ createdAt: { $gte: since } });

    // If threshold exceeded (> 10 failures in 24h) and alert webhook configured
    if (count24h >= 10 && process.env.ALERT_WEBHOOK_URL && Date.now() - lastAlertTime > ALERT_COOLDOWN) {
      lastAlertTime = Date.now();
      fetch(process.env.ALERT_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alert: 'TempMail Failure Spike Alert',
          failuresLast24h: count24h,
          latestError: errMessage,
          source,
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => {});
    }
  } catch (err) {
    console.error('Failed to log error to Failure collection:', err.message);
  }
}
