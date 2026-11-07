import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { api } from '../../api';
import Toggle from './ui/Toggle';
import Card from './ui/Card';
import { useConfirm } from '../ui/ConfirmDialog';

export default function SettingsTab() {
  const confirm = useConfirm();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [cleanupDays, setCleanupDays] = useState(7);
  const [cleaning, setCleaning] = useState(false);
  const [cleanupReport, setCleanupReport] = useState(null);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await api('/admin/settings');
      setSettings(data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);
    try {
      const updated = await api('/admin/settings', {
        method: 'PUT',
        body: settings,
      });
      setSettings(updated);
      setSaveSuccess(true);
      toast.success('System settings saved successfully.');
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      toast.error(err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleManualCleanup = async () => {
    const ok = await confirm({
      title: 'Purge Mailboxes & Messages',
      description: `Purge all mailboxes and messages older than ${cleanupDays} days? This operation is permanent.`,
      confirmText: 'Purge Expired Data',
      cancelText: 'Cancel',
      destructive: true,
    });
    if (!ok) return;

    setCleaning(true);
    try {
      const report = await api('/admin/cleanup', {
        method: 'POST',
        body: { days: Number(cleanupDays) },
      });
      setCleanupReport(report);
      loadSettings();
      toast.success(`Cleanup complete: deleted ${report?.deletedMailboxes ?? 0} mailboxes, ${report?.deletedMessages ?? 0} messages.`);
    } catch (err) {
      toast.error(err.message || 'Data cleanup failed.');
    } finally {
      setCleaning(false);
    }
  };

  const handleExportBackup = () => {
    const token = localStorage.getItem('tm_admin');
    window.open(`/api/admin/backup/export?token=${encodeURIComponent(token || '')}`, '_blank');
  };

  if (loading || !settings) {
    return <div className="py-16 text-center text-sm text-slate-400">Loading settings...</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Maintenance Mode Alert Banner */}
      {settings.maintenanceMode && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-semibold flex items-center justify-between">
          <span>⚠️ Maintenance mode is ACTIVE. Public mailbox creation is currently paused.</span>
          <button
            onClick={() => setSettings((s) => ({ ...s, maintenanceMode: false }))}
            className="underline hover:no-underline font-bold"
          >
            Disable
          </button>
        </div>
      )}

      {saveSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-bold">
          ✓ System settings saved successfully.
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Operations & Feature Flags Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            System Operations & Feature Toggles
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-white">Maintenance Mode</div>
                <div className="text-[11px] text-slate-400">Pauses public mailbox creation with 503 status</div>
              </div>
              <Toggle
                checked={!!settings.maintenanceMode}
                onChange={(checked) => setSettings({ ...settings, maintenanceMode: checked })}
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-white">Automated 7-Day Cleanup</div>
                <div className="text-[11px] text-slate-400">Purges expired records automatically hourly</div>
              </div>
              <Toggle
                checked={!!settings.autoCleanupEnabled}
                onChange={(checked) => setSettings({ ...settings, autoCleanupEnabled: checked })}
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-white">Premium Checkout ($4.99/mo)</div>
                <div className="text-[11px] text-slate-400">Allow users to purchase subscriptions</div>
              </div>
              <Toggle
                checked={settings.featureFlags?.premiumSignup !== false}
                onChange={(checked) =>
                  setSettings({
                    ...settings,
                    featureFlags: { ...settings.featureFlags, premiumSignup: checked },
                  })
                }
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-white">Developer REST API v1</div>
                <div className="text-[11px] text-slate-400">Enable programmatic developer access</div>
              </div>
              <Toggle
                checked={settings.featureFlags?.apiAccess !== false}
                onChange={(checked) =>
                  setSettings({
                    ...settings,
                    featureFlags: { ...settings.featureFlags, apiAccess: checked },
                  })
                }
              />
            </div>
          </div>
        </div>

        {/* Core Quotas & Limits */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Storage, Retention & Quota Rules
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                Default Inbox Lifespan (Minutes)
              </label>
              <input
                type="number"
                min="5"
                max="1440"
                value={settings.ttlMinutes || 30}
                onChange={(e) => setSettings({ ...settings, ttlMinutes: Number(e.target.value) })}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                Max Inbound Message Size (KB)
              </label>
              <input
                type="number"
                min="64"
                max="10240"
                value={settings.maxMessageKB || 2048}
                onChange={(e) => setSettings({ ...settings, maxMessageKB: Number(e.target.value) })}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                Rate Limit per 10 Minutes
              </label>
              <input
                type="number"
                min="1"
                max="1000"
                value={settings.rateLimit10m || 20}
                onChange={(e) => setSettings({ ...settings, rateLimit10m: Number(e.target.value) })}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                Data Retention Period (Days)
              </label>
              <input
                type="number"
                min="1"
                max="365"
                value={settings.dataRetentionDays || 7}
                onChange={(e) => setSettings({ ...settings, dataRetentionDays: Number(e.target.value) })}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Google Gemini AI Blog Automation & Research Settings */}
        <div className="bg-white dark:bg-slate-900 border border-teal-500/30 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>🤖</span> Google Gemini AI Blog Automation
              </h3>
              <p className="text-xs text-slate-500">
                Automatically researches cybersecurity and temp mail topics, synthesizes articles, creates cover graphics, and posts every 24 hours.
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold">
              <input
                type="checkbox"
                checked={settings.geminiAutoBlogEnabled !== false}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    geminiAutoBlogEnabled: e.target.checked,
                  })
                }
                className="w-4 h-4 rounded text-teal-600"
              />
              <span>Auto-Publish Enabled (24h)</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                Gemini API Key
              </label>
              <input
                type="password"
                placeholder={settings.geminiApiKey ? '••••••••••••••••' : 'AIzaSy... (or set GEMINI_API_KEY in .env)'}
                value={settings.geminiApiKey || ''}
                onChange={(e) => setSettings({ ...settings, geminiApiKey: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Saved securely in MongoDB. Falls back to <code className="text-teal-600">process.env.GEMINI_API_KEY</code> if left blank.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                Research & Writing Model
              </label>
              <select
                value={settings.geminiModel || 'gemini-3.8-flash'}
                onChange={(e) => setSettings({ ...settings, geminiModel: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
              >
                <option value="gemini-3.8-flash">gemini-3.8-flash (Recommended · Fast, Multimodal Research)</option>
                <option value="gemini-4-argon">gemini-4-argon (Most Powerful Reasoning)</option>
                <option value="gemini-3.5-flash-lite">gemini-3.5-flash-lite (Ultra Fast)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                Photorealistic Cover Image Model
              </label>
              <select
                value={settings.geminiImageModel || 'gemini-3-pro-image'}
                onChange={(e) => setSettings({ ...settings, geminiImageModel: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
              >
                <option value="gemini-3-pro-image">gemini-3-pro-image (Nano Banana Pro · Photorealistic & Ultra High Quality)</option>
                <option value="gemini-nano-banana-2.1">gemini-nano-banana-2.1 (Nano Banana 2.1 · Balanced)</option>
                <option value="gemini-3.1-flash-lite-image">gemini-3.1-flash-lite-image (Nano Banana 2 Lite · Ultra Fast)</option>
              </select>
              <span className="text-[10px] text-slate-400 mt-1 block">
                Generates high-definition photorealistic 16:9 editorial imagery with automatic high-resolution photography fallbacks.
              </span>
            </div>
          </div>
        </div>

        {/* Google AdSense & Advertising Settings */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>💰</span> Google AdSense & Monetization
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Manage your Google AdSense publisher ID, ads.txt verification file, and ad placements.
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold">
              <input
                type="checkbox"
                checked={settings.adsEnabled !== false}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    adsEnabled: e.target.checked,
                  })
                }
                className="w-4 h-4 rounded text-teal-600"
              />
              <span>Ads Enabled</span>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                Google AdSense Publisher ID
              </label>
              <input
                type="text"
                placeholder="pub-1052993488526571"
                value={settings.adsensePublisherId || 'pub-1052993488526571'}
                onChange={(e) => setSettings({ ...settings, adsensePublisherId: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Your Google AdSense account ID (<code className="text-teal-600">ca-pub-1052993488526571</code>).
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-500 uppercase">
                  ads.txt Records
                </label>
                <a
                  href="/ads.txt"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-teal-600 hover:underline font-semibold"
                >
                  View /ads.txt ↗
                </a>
              </div>
              <textarea
                rows={3}
                placeholder="google.com, pub-1052993488526571, DIRECT, f08c47fec0942fa0"
                value={settings.adsTxt || 'google.com, pub-1052993488526571, DIRECT, f08c47fec0942fa0'}
                onChange={(e) => setSettings({ ...settings, adsTxt: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Served automatically at <code className="text-teal-600">/ads.txt</code> for Google AdSense verification.
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Ad Unit Placements (HTML / JavaScript)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Header Ad Unit (Above Inbox)
                </label>
                <textarea
                  rows={2}
                  placeholder="<ins class='adsbygoogle' ...></ins>"
                  value={settings.adHeader || ''}
                  onChange={(e) => setSettings({ ...settings, adHeader: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Below Address Card Ad Unit
                </label>
                <textarea
                  rows={2}
                  placeholder="<ins class='adsbygoogle' ...></ins>"
                  value={settings.adBelowCard || ''}
                  onChange={(e) => setSettings({ ...settings, adBelowCard: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Sidebar / Message Reader Ad Unit
                </label>
                <textarea
                  rows={2}
                  placeholder="<ins class='adsbygoogle' ...></ins>"
                  value={settings.adSidebar || ''}
                  onChange={(e) => setSettings({ ...settings, adSidebar: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] font-mono"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Google Analytics 4 (GA4) Integration */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Google Analytics 4 (GA4) Tracking
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Collects live visitor traffic, demographics, active users, page views, and traffic sources.
              </p>
            </div>
            <a
              href="https://analytics.google.com"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-teal-600 hover:underline font-semibold"
            >
              Open Google Analytics ↗
            </a>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
              Measurement ID
            </label>
            <input
              type="text"
              placeholder="G-E3TY5VJGNF"
              value={settings.googleAnalyticsId ?? 'G-E3TY5VJGNF'}
              onChange={(e) => setSettings({ ...settings, googleAnalyticsId: e.target.value })}
              className="w-full md:w-80 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
            />
            <span className="text-[10px] text-slate-400 mt-1 block">
              Configured with Stream ID: 16282400882. Enhanced measurement tracks pageviews, scroll depth, and clicks.
            </span>
          </div>
        </div>

        {/* Global Announcement Banner Editor */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Global Announcement Banner
            </h3>
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold">
              <input
                type="checkbox"
                checked={!!settings.announcementBanner?.enabled}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    announcementBanner: { ...settings.announcementBanner, enabled: e.target.checked },
                  })
                }
                className="w-4 h-4 rounded text-teal-600"
              />
              <span>Banner Active</span>
            </label>
          </div>

          <input
            type="text"
            placeholder="Banner message displayed at the top of the homepage (e.g. System upgrade scheduled at 02:00 UTC)..."
            value={settings.announcementBanner?.message || ''}
            onChange={(e) =>
              setSettings({
                ...settings,
                announcementBanner: { ...settings.announcementBanner, message: e.target.value },
              })
            }
            className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
          />
        </div>

        {/* Save Bar */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save All Settings'}
          </button>
        </div>
      </form>

      {/* Manual Data Cleanup & Disaster Backup Tools */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
        <h3 className="text-base font-bold text-slate-900 dark:text-white">
          Data Lifecycle & Disaster Recovery
        </h3>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Manual Data Purge (7-Day Retention)
            </h4>
            <p className="text-xs text-slate-400 mb-3">
              Instantly cleans all messages, attachments, and inactive mailboxes older than retention days.
            </p>
            <div className="flex gap-2">
              <input
                type="number"
                min="1"
                max="365"
                value={cleanupDays}
                onChange={(e) => setCleanupDays(e.target.value)}
                className="w-20 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              />
              <button
                onClick={handleManualCleanup}
                disabled={cleaning}
                className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs cursor-pointer shadow-sm"
              >
                {cleaning ? 'Purging...' : 'Execute Purge'}
              </button>
            </div>
            {cleanupReport && (
              <div className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                ✓ Purge complete: {cleanupReport.totalDeleted || 0} total records removed from MongoDB ({cleanupReport.messagesDeleted || cleanupReport.deletedMessages || 0} messages, {cleanupReport.mailboxesDeleted || cleanupReport.deletedMailboxes || 0} mailboxes, {cleanupReport.autoBlogPostsDeleted || 0} expired AI blog posts).
              </div>
            )}
          </div>

          <div className="flex-1 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850 flex flex-col justify-between">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Disaster Recovery JSON Backup
              </h4>
              <p className="text-xs text-slate-400">
                Exports all system settings, domain configurations, blog posts, and active rules into a single portable backup file.
              </p>
            </div>
            <button
              onClick={handleExportBackup}
              className="mt-3 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 font-semibold text-xs text-slate-700 dark:text-slate-300 transition-colors shadow-sm cursor-pointer"
            >
              📥 Download Disaster Backup JSON
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
