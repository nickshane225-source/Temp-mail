import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../api';
import Card from './ui/Card';
import Badge from './ui/Badge';

export default function MessagesTab() {
  const [messages, setMessages] = useState([]);
  const [spamQueue, setSpamQueue] = useState([]);
  const [viewMode, setViewMode] = useState('all'); // 'all' or 'spam_queue'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (viewMode === 'all') {
        const list = await api('/admin/messages');
        setMessages(Array.isArray(list) ? list : []);
      } else {
        const queue = await api('/admin/spam-queue');
        setSpamQueue(Array.isArray(queue) ? queue : []);
      }
      setSelectedIds(new Set());
    } catch (err) {
      setError(err.message || 'Failed to load messages.');
    } finally {
      setLoading(false);
    }
  }, [viewMode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const currentList = viewMode === 'all' ? messages : spamQueue;
  const filteredList = currentList.filter(
    (m) =>
      !searchFilter ||
      m.address?.toLowerCase().includes(searchFilter.toLowerCase()) ||
      m.from?.toLowerCase().includes(searchFilter.toLowerCase()) ||
      m.subject?.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredList.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredList.map((m) => m._id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Are you sure you want to permanently delete ${selectedIds.size} messages? Any GridFS attachments will also be cleaned up.`)) {
      return;
    }
    setDeleting(true);
    try {
      await api('/admin/messages/bulk-delete', {
        method: 'POST',
        body: { ids: Array.from(selectedIds) },
      });
      await loadData();
    } catch (err) {
      alert(err.message || 'Failed to delete messages.');
    } finally {
      setDeleting(false);
    }
  };

  const handleBlockSender = async (senderEmail) => {
    if (!confirm(`Add ${senderEmail} to the global Abuse Blocklist?`)) return;
    try {
      await api('/admin/blocklist', {
        method: 'POST',
        body: { type: 'address', value: senderEmail, reason: 'Blocked from Spam Review Queue' },
      });
      alert(`Sender ${senderEmail} is now blocked.`);
    } catch (err) {
      alert(err.message || 'Failed to block sender.');
    }
  };

  const handleDeleteOne = async (id) => {
    if (!confirm('Delete this message?')) return;
    try {
      await api(`/admin/messages/${id}`, { method: 'DELETE' });
      loadData();
    } catch (err) {
      alert(err.message || 'Failed to delete message.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Controls Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Message Operations & Spam Queue
            </h2>
            <p className="text-xs text-slate-500">
              Metadata inspection, bulk actions, and spam threat quarantine (bodies remain private)
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl flex gap-1">
              <button
                onClick={() => setViewMode('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === 'all'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                All Messages
              </button>
              <button
                onClick={() => setViewMode('spam_queue')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === 'spam_queue'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                ⚠️ Spam Queue
              </button>
            </div>

            {selectedIds.size > 0 && (
              <button
                onClick={handleBulkDelete}
                disabled={deleting}
                className="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors shadow-sm disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : `Delete Selected (${selectedIds.size})`}
              </button>
            )}
          </div>
        </div>

        {/* Search filter input */}
        <div>
          <input
            type="text"
            placeholder="Filter messages by recipient address, sender, or subject..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      </div>

      {/* Messages Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">Loading messages...</div>
        ) : error ? (
          <div className="p-6 text-center text-red-600 text-sm">{error}</div>
        ) : filteredList.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">
            {viewMode === 'spam_queue' ? 'No quarantined spam messages at this time.' : 'No messages found.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-4 w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filteredList.length && filteredList.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-4">Recipient</th>
                  <th className="py-3 px-4">From</th>
                  <th className="py-3 px-4">Subject</th>
                  <th className="py-3 px-4">Spam Score</th>
                  <th className="py-3 px-4">Received</th>
                  <th className="py-3 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {filteredList.map((m) => (
                  <tr
                    key={m._id}
                    className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${
                      selectedIds.has(m._id) ? 'bg-teal-50/40 dark:bg-teal-950/20' : ''
                    }`}
                  >
                    <td className="py-3.5 px-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(m._id)}
                        onChange={() => toggleSelect(m._id)}
                        className="rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                      />
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-800 dark:text-slate-200">
                      {m.address}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 max-w-[200px] truncate">
                      {m.from}
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-800 dark:text-slate-200 max-w-[280px] truncate">
                      {m.subject || '(No subject)'}
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge
                        variant={
                          (m.spamScore || 0) >= 50
                            ? 'danger'
                            : (m.spamScore || 0) >= 20
                            ? 'warning'
                            : 'neutral'
                        }
                      >
                        {m.spamScore || 0} / 100
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap">
                      {new Date(m.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-3.5 px-5 text-right whitespace-nowrap">
                      {viewMode === 'spam_queue' && m.from && (
                        <button
                          onClick={() => handleBlockSender(m.from)}
                          className="mr-2 text-amber-600 hover:text-amber-700 font-semibold text-xs"
                        >
                          Block Sender
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteOne(m._id)}
                        className="text-red-500 hover:text-red-700 font-semibold text-xs"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
