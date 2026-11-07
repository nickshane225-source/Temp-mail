import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { api } from '../../api';
import Card from './ui/Card';
import StatCard from './ui/StatCard';
import Badge from './ui/Badge';
import DataTable from './ui/DataTable';
import Drawer from './ui/Drawer';

export default function PaymentsTab() {
  const [stats, setStats] = useState(null);
  const [payments, setPayments] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Webhook log drawer/modal state
  const [showWebhooks, setShowWebhooks] = useState(false);
  const [webhookLogs, setWebhookLogs] = useState([]);
  const [loadingWebhooks, setLoadingWebhooks] = useState(false);

  // Manual reconcile modal state
  const [reconcileTarget, setReconcileTarget] = useState(null);
  const [reconcileDays, setReconcileDays] = useState(30);
  const [reconcileNote, setReconcileNote] = useState('');
  const [reconciling, setReconciling] = useState(false);

  const fetchStats = async () => {
    try {
      const data = await api('/admin/payments/stats');
      setStats(data);
    } catch {}
  };

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api(`/admin/payments?page=${page}&limit=15`);
      setPayments(res.payments || []);
      setTotal(res.total || 0);
      setTotalPages(res.totalPages || 1);
    } catch (err) {
      setError(err.message || 'Failed to load payments.');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchStats();
    fetchPayments();
  }, [fetchPayments]);

  const loadWebhooks = async () => {
    setShowWebhooks(true);
    setLoadingWebhooks(true);
    try {
      const res = await api('/admin/payments/webhooks?limit=50');
      setWebhookLogs(res.logs || []);
    } catch {}
    setLoadingWebhooks(false);
  };

  const handleReconcileSubmit = async (e) => {
    e.preventDefault();
    if (!reconcileTarget) return;
    setReconciling(true);
    try {
      await api('/admin/payments/reconcile', {
        method: 'POST',
        body: {
          paymentId: reconcileTarget._id,
          grantDays: Number(reconcileDays),
          note: reconcileNote,
        },
      });
      setReconcileTarget(null);
      fetchStats();
      fetchPayments();
      toast.success('Payment successfully reconciled and premium granted.');
    } catch (err) {
      toast.error(err.message || 'Failed to reconcile payment.');
    } finally {
      setReconciling(false);
    }
  };

  const columns = [
    {
      header: 'Provider',
      render: (p) => (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
          {p.provider}
        </span>
      ),
    },
    {
      header: 'User Email',
      render: (p) => (
        <span className="font-semibold text-slate-900 dark:text-white">
          {p.userEmail || '—'}
        </span>
      ),
    },
    {
      header: 'Amount',
      render: (p) => (
        <span className="font-mono font-bold text-slate-900 dark:text-white">
          ${p.amount} {p.currency}
        </span>
      ),
    },
    {
      header: 'Order / Payment ID',
      render: (p) => (
        <span className="font-mono text-xs text-slate-500">
          {p.orderId || p.paymentId || '—'}
        </span>
      ),
    },
    {
      header: 'Status',
      render: (p) => {
        const isFin = p.status === 'finished' || p.status === 'confirmed';
        const isWait = p.status === 'waiting' || p.status === 'confirming';
        return (
          <Badge
            variant={isFin ? 'success' : isWait ? 'warning' : 'danger'}
            dot
          >
            {p.status}
          </Badge>
        );
      },
    },
    {
      header: 'Date',
      render: (p) => (
        <span className="text-slate-500 text-xs">
          {new Date(p.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      header: 'Action',
      align: 'right',
      render: (p) => (
        <div className="flex items-center justify-end gap-2">
          {p.status !== 'finished' && (
            <button
              onClick={() => setReconcileTarget(p)}
              className="px-2.5 py-1 rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 text-xs font-semibold hover:bg-teal-100 transition-colors"
            >
              Reconcile
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Revenue Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          title="Monthly Recurring Revenue"
          value={`$${(stats?.mrr || 0).toFixed(2)}`}
          priorLabel="active subscribers"
          priorValue={stats?.activeSubscribers || 0}
          icon="💰"
        />

        <StatCard
          title="New Premium This Week"
          value={`+${stats?.newPremiumThisWeek || 0}`}
          priorLabel="confirmed in last 7 days"
          priorValue={stats?.newPremiumThisWeek || 0}
          icon="📈"
        />

        <StatCard
          title="Expiring in 7 Days"
          value={stats?.expiringIn7Days || 0}
          priorLabel="subscribers up for renewal"
          priorValue={stats?.expiringIn7Days || 0}
          icon="⏳"
        />

        <StatCard
          title="Conversion Rate"
          value={`${stats?.conversionRate || 0}%`}
          priorLabel="free-to-premium ratio"
          priorValue={stats?.conversionRate || 0}
          icon="🎯"
        />
      </div>

      {/* Main Ledger Card */}
      <Card
        title="Payments Ledger"
        subtitle={`Complete transaction history from NOWPayments & Stripe gateways (${total} total transactions)`}
        action={
          <button
            onClick={loadWebhooks}
            className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors shadow-2xs"
          >
            🔍 Webhook Logs
          </button>
        }
      >
        <DataTable
          columns={columns}
          data={payments}
          loading={loading}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          emptyMessage="No payments recorded in the database yet."
        />
      </Card>

      {/* Webhooks Drawer */}
      <Drawer
        isOpen={showWebhooks}
        onClose={() => setShowWebhooks(false)}
        title="Webhook Audit Logs"
        subtitle="Incoming IPN callbacks and signature verification telemetry"
        width="max-w-2xl"
      >
        {loadingWebhooks ? (
          <div className="py-12 text-center text-xs text-slate-400">Loading audit log events...</div>
        ) : webhookLogs.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">No webhook callbacks recorded yet.</div>
        ) : (
          <div className="space-y-3">
            {webhookLogs.map((log) => (
              <div
                key={log._id}
                className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50 text-xs"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-slate-900 dark:text-white uppercase font-mono">
                    {log.provider} • {log.event}
                  </span>
                  <Badge variant={log.status === 'processed' ? 'success' : 'danger'}>
                    {log.status}
                  </Badge>
                </div>
                {log.error && (
                  <div className="text-rose-600 dark:text-rose-400 font-mono text-[11px] mb-2">
                    Error: {log.error}
                  </div>
                )}
                <div className="text-[11px] text-slate-400 flex items-center justify-between">
                  <span>IP: {log.ip || 'unknown'}</span>
                  <span>{new Date(log.createdAt).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Drawer>

      {/* Manual Reconcile Modal */}
      {reconcileTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-6">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
              Manual Payment Reconcile
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Manually activate premium for user <span className="font-semibold text-slate-800 dark:text-slate-200">{reconcileTarget.userEmail}</span> if a webhook was dropped.
            </p>

            <form onSubmit={handleReconcileSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Days to Grant
                </label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={reconcileDays}
                  onChange={(e) => setReconcileDays(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Reconciliation Note / Reason
                </label>
                <textarea
                  required
                  placeholder="e.g. Verified transaction on blockchain explorer..."
                  value={reconcileNote}
                  onChange={(e) => setReconcileNote(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm h-20"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReconcileTarget(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reconciling}
                  className="px-4 py-2 rounded-xl bg-[#0F766E] hover:bg-teal-800 text-white text-xs font-semibold"
                >
                  {reconciling ? 'Reconciling...' : 'Confirm & Grant Premium'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
