import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../api';
import Card from './ui/Card';
import Badge from './ui/Badge';
import Drawer from './ui/Drawer';

export default function DomainsTab() {
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Bulk add modal state
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [bulkDomainsInput, setBulkDomainsInput] = useState('');
  const [addingBulk, setAddingBulk] = useState(false);

  // Single add state
  const [newDomain, setNewDomain] = useState('');
  const [addingSingle, setAddingSingle] = useState(false);

  // DNS Helper drawer state
  const [dnsTargetDomain, setDnsTargetDomain] = useState(null);
  const [copiedKey, setCopiedKey] = useState('');

  const loadDomains = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await api('/admin/domains');
      setDomains(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(err.message || 'Failed to load domains.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDomains();
  }, [loadDomains]);

  const handleAddSingle = async (e) => {
    e.preventDefault();
    if (!newDomain.trim()) return;
    setAddingSingle(true);
    try {
      await api('/admin/domains', {
        method: 'POST',
        body: { name: newDomain.trim() },
      });
      setNewDomain('');
      loadDomains();
    } catch (err) {
      alert(err.message || 'Failed to add domain.');
    } finally {
      setAddingSingle(false);
    }
  };

  const handleBulkAdd = async (e) => {
    e.preventDefault();
    const raw = bulkDomainsInput.split(/[\n,]+/).map((d) => d.trim().toLowerCase()).filter(Boolean);
    if (!raw.length) return;
    setAddingBulk(true);
    try {
      for (const name of raw) {
        await api('/admin/domains', { method: 'POST', body: { name } }).catch(() => {});
      }
      setShowBulkAdd(false);
      setBulkDomainsInput('');
      loadDomains();
    } catch (err) {
      alert(err.message || 'Bulk addition encountered an error.');
    } finally {
      setAddingBulk(false);
    }
  };

  const handleToggleActive = async (id, currentActive) => {
    try {
      await api(`/admin/domains/${id}`, {
        method: 'PATCH',
        body: { active: !currentActive },
      });
      loadDomains();
    } catch (err) {
      alert(err.message || 'Failed to update domain state.');
    }
  };

  const handleMakeDefault = async (id) => {
    try {
      await api(`/admin/domains/${id}/make-default`, { method: 'POST' });
      loadDomains();
    } catch (err) {
      alert(err.message || 'Failed to set default domain.');
    }
  };

  const handleCheckHealth = async (id) => {
    try {
      await api(`/admin/domains/${id}/check`, { method: 'POST' });
      loadDomains();
    } catch (err) {
      alert(err.message || 'Health check failed.');
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to remove domain "${name}"? Existing mailboxes under this domain will stop receiving messages.`)) {
      return;
    }
    try {
      await api(`/admin/domains/${id}`, { method: 'DELETE' });
      loadDomains();
    } catch (err) {
      alert(err.message || 'Failed to delete domain.');
    }
  };

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Action / Add Domain Card */}
      <Card
        title="Domain Management"
        subtitle="Manage routing domains, monitor MX/SPF health checks, and configure default prefixes"
        action={
          <button
            onClick={() => setShowBulkAdd(true)}
            className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors shadow-2xs"
          >
            + Bulk Add Domains
          </button>
        }
      >
        <form onSubmit={handleAddSingle} className="flex flex-wrap gap-3">
          <input
            type="text"
            required
            placeholder="Add new domain (e.g. maildrop.dev or disposable.cc)"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            className="flex-1 min-w-[280px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:border-teal-600 focus:outline-none"
          />
          <button
            type="submit"
            disabled={addingSingle}
            className="px-5 py-2.5 rounded-xl bg-[#0F766E] hover:bg-teal-800 text-white font-semibold text-xs transition-colors shadow-xs"
          >
            {addingSingle ? 'Adding...' : '+ Add Domain'}
          </button>
        </form>
      </Card>

      {/* Domains Table Card */}
      <Card>
        {loading ? (
          <div className="py-16 text-center text-xs text-slate-400">Loading active domains...</div>
        ) : error ? (
          <div className="py-8 text-center text-xs text-rose-600">{error}</div>
        ) : domains.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-400">
            No domains configured. Add a domain above to start receiving emails.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 text-[11px] font-semibold uppercase tracking-wider">
                  <th className="py-3 px-3">Domain Name</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">DNS Health</th>
                  <th className="py-3 px-3">Default</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {domains.map((d) => (
                  <tr key={d._id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-3 font-semibold text-slate-900 dark:text-white">
                      <div className="flex items-center gap-2">
                        <span>{d.name}</span>
                        <button
                          type="button"
                          onClick={() => setDnsTargetDomain(d)}
                          className="text-[11px] text-teal-600 dark:text-teal-400 hover:underline"
                        >
                          DNS Guide 📋
                        </button>
                      </div>
                    </td>
                    <td className="py-3.5 px-3">
                      <Badge variant={d.active ? 'success' : 'neutral'} dot>
                        {d.active ? 'Active' : 'Paused'}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-3">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            d.status === 'Healthy'
                              ? 'success'
                              : d.status === 'Warning'
                              ? 'warning'
                              : d.status === 'Failing'
                              ? 'danger'
                              : 'neutral'
                          }
                        >
                          {d.status || 'Unknown'}
                        </Badge>
                        <button
                          type="button"
                          onClick={() => handleCheckHealth(d._id)}
                          className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline"
                          title="Run DNS check now"
                        >
                          Check
                        </button>
                      </div>
                    </td>
                    <td className="py-3.5 px-3">
                      {d.isDefault ? (
                        <span className="text-[11px] font-bold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950 px-2 py-0.5 rounded-full">
                          ✓ Default
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleMakeDefault(d._id)}
                          className="text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline"
                        >
                          Set default
                        </button>
                      )}
                    </td>
                    <td className="py-3.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(d._id, d.active)}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold hover:bg-slate-50 transition-colors"
                        >
                          {d.active ? 'Pause' : 'Activate'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(d._id, d.name)}
                          className="px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 text-xs font-semibold hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* DNS Setup Guide Drawer */}
      <Drawer
        isOpen={Boolean(dnsTargetDomain)}
        onClose={() => setDnsTargetDomain(null)}
        title="DNS Configuration Guide"
        subtitle={`Required DNS records for ${dnsTargetDomain?.name}`}
        width="max-w-xl"
      >
        {dnsTargetDomain && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500 leading-relaxed">
              Add the following records to your domain's DNS provider (e.g. Cloudflare, Namecheap, AWS Route53) to route incoming mail to TempMail:
            </p>

            {/* MX Record */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300">
                  1. MX Record (Inbound Delivery)
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(`10 mail.${dnsTargetDomain.name}`, 'mx')}
                  className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline"
                >
                  {copiedKey === 'mx' ? '✓ Copied' : 'Copy Record'}
                </button>
              </div>
              <div className="text-xs font-mono text-slate-700 dark:text-slate-300 space-y-1">
                <div>Type: <span className="font-bold">MX</span></div>
                <div>Host / Name: <span className="font-bold">@</span></div>
                <div>Priority: <span className="font-bold">10</span></div>
                <div>Target / Value: <span className="font-bold">mail.{dnsTargetDomain.name}</span></div>
              </div>
            </div>

            {/* SPF Record */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300">
                  2. TXT / SPF Record (Authentication)
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(`v=spf1 mx ~all`, 'spf')}
                  className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline"
                >
                  {copiedKey === 'spf' ? '✓ Copied' : 'Copy Record'}
                </button>
              </div>
              <div className="text-xs font-mono text-slate-700 dark:text-slate-300 space-y-1">
                <div>Type: <span className="font-bold">TXT</span></div>
                <div>Host / Name: <span className="font-bold">@</span></div>
                <div>Value: <span className="font-bold">v=spf1 mx ~all</span></div>
              </div>
            </div>

            {/* DKIM Record */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300">
                  3. TXT / DKIM Record (Optional)
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(`v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQ`, 'dkim')}
                  className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline"
                >
                  {copiedKey === 'dkim' ? '✓ Copied' : 'Copy Record'}
                </button>
              </div>
              <div className="text-xs font-mono text-slate-700 dark:text-slate-300 space-y-1">
                <div>Type: <span className="font-bold">TXT</span></div>
                <div>Host / Name: <span className="font-bold">mail._domainkey</span></div>
                <div>Value: <span className="font-bold">v=DKIM1; k=rsa; p=MIGf...</span></div>
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setDnsTargetDomain(null)}
                className="px-5 py-2.5 rounded-xl bg-[#0F766E] hover:bg-teal-800 text-white font-semibold text-xs"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </Drawer>

      {/* Bulk Onboard Modal */}
      {showBulkAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-6">
            <h3 className="text-base font-bold mb-1 text-slate-900 dark:text-white">
              Bulk Domain Onboarding
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Enter multiple domain names separated by new lines or commas.
            </p>

            <form onSubmit={handleBulkAdd} className="space-y-4">
              <textarea
                rows={5}
                required
                placeholder="domain1.com&#10;domain2.org&#10;domain3.net"
                value={bulkDomainsInput}
                onChange={(e) => setBulkDomainsInput(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono focus:border-teal-600 focus:outline-none"
              />

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowBulkAdd(false)}
                  className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingBulk}
                  className="flex-1 py-2 rounded-xl bg-[#0F766E] hover:bg-teal-800 text-white font-semibold text-xs"
                >
                  {addingBulk ? 'Onboarding...' : 'Start Onboarding'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
