import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { api } from '../../api';
import Card from './ui/Card';
import Badge from './ui/Badge';
import DataTable from './ui/DataTable';
import UserDetailDrawer from './UserDetailDrawer';

export default function UsersTab() {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [premiumFilter, setPremiumFilter] = useState('all');
  const [sortBy, setSortBy] = useState('createdAt_desc');

  // Selected user for drawer
  const [selectedUserId, setSelectedUserId] = useState(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '15',
        sort: sortBy,
      });
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (premiumFilter !== 'all') params.set('premium', premiumFilter);

      const res = await api(`/admin/users?${params.toString()}`);
      setUsers(res.users || []);
      setTotal(res.total || 0);
      setTotalPages(res.totalPages || 1);
    } catch (err) {
      setError(err.message || 'Failed to load users list.');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, premiumFilter, sortBy]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleExportCsv = () => {
    const token = localStorage.getItem('tm_admin');
    window.open(`/api/admin/users/export?token=${encodeURIComponent(token || '')}`, '_blank');
  };

  const handleQuickGrant = async (userId, e) => {
    e.stopPropagation();
    try {
      await api(`/admin/users/${userId}/grant-premium`, { method: 'POST', body: { days: 30 } });
      fetchUsers();
      toast.success('30 days premium granted successfully.');
    } catch (err) {
      toast.error(err.message || 'Failed to grant premium.');
    }
  };

  const columns = [
    {
      header: 'Email Address',
      render: (u) => (
        <div>
          <span className="font-semibold text-slate-900 dark:text-white block">
            {u.email}
          </span>
          <span className="text-[11px] text-slate-400 font-mono">
            ID: {u._id}
          </span>
        </div>
      ),
    },
    {
      header: 'Status',
      render: (u) => (
        <Badge
          variant={
            u.status === 'active'
              ? 'success'
              : u.status === 'suspended'
              ? 'warning'
              : 'danger'
          }
          dot
        >
          {u.status || 'active'}
        </Badge>
      ),
    },
    {
      header: 'Subscription',
      render: (u) => (
        <div>
          {u.isPremium ? (
            <Badge variant="teal">★ Premium</Badge>
          ) : (
            <Badge variant="neutral">Free</Badge>
          )}
          {u.premiumUntil && (
            <span className="block text-[11px] text-slate-400 mt-0.5">
              Until {new Date(u.premiumUntil).toLocaleDateString()}
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'API Keys',
      render: (u) => (
        <span className="font-mono text-xs">
          {u.apiKeys ? u.apiKeys.length : 0} keys
        </span>
      ),
    },
    {
      header: 'Signup Date',
      render: (u) => (
        <span className="text-xs text-slate-500">
          {new Date(u.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      header: 'Actions',
      align: 'right',
      render: (u) => (
        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
          {!u.isPremium && (
            <button
              type="button"
              onClick={(e) => handleQuickGrant(u._id, e)}
              className="px-2.5 py-1 rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 text-xs font-semibold hover:bg-teal-100 transition-colors"
            >
              +30d
            </button>
          )}
          <button
            type="button"
            onClick={() => setSelectedUserId(u._id)}
            className="px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 transition-colors shadow-2xs"
          >
            Details →
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header & Filter Card */}
      <Card
        title="User Management"
        subtitle={`${total} registered accounts across free and premium tiers`}
        action={
          <button
            onClick={handleExportCsv}
            className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors shadow-2xs flex items-center gap-1.5"
          >
            <span>📥 Export CSV</span>
          </button>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <input
              type="text"
              placeholder="Search by email..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
            />
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
            >
              <option value="all">All Account Statuses</option>
              <option value="active">Active Only</option>
              <option value="suspended">Suspended Only</option>
              <option value="banned">Banned Only</option>
            </select>
          </div>

          <div>
            <select
              value={premiumFilter}
              onChange={(e) => {
                setPremiumFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
            >
              <option value="all">All Subscription Tiers</option>
              <option value="premium">Premium Pro Only</option>
              <option value="free">Free Users Only</option>
            </select>
          </div>

          <div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
            >
              <option value="createdAt_desc">Newest First</option>
              <option value="createdAt_asc">Oldest First</option>
              <option value="lastLoginAt_desc">Recently Active</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Users DataTable */}
      <DataTable
        columns={columns}
        data={users}
        loading={loading}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        emptyMessage="No users matching current filters found."
      />

      {/* User Detail Drawer */}
      {selectedUserId && (
        <UserDetailDrawer
          userId={selectedUserId}
          onClose={() => setSelectedUserId(null)}
          onUserUpdated={fetchUsers}
        />
      )}
    </div>
  );
}
