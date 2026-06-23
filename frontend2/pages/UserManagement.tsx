import React, { useState, useEffect } from 'react';
import {
  Users, UserCheck, AlertTriangle, XCircle, ChevronDown, ChevronUp,
  Edit2, Save, FileText, RefreshCw, Search, FileSearch,
} from 'lucide-react';
import { apiGet, apiPost } from '../lib/api';
import { fmtDate, initials, truncate } from '../lib/format';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import StatusPill from '../components/StatusPill';
import EmptyState from '../components/EmptyState';
import { LoadingBlock } from '../components/Spinner';
import Modal from '../components/Modal';

type FilterType = 'ALL' | 'PAID' | 'UNPAID' | 'FAILED' | 'PENDING_APPROVALS';

const FILTERS: { value: FilterType; label: string }[] = [
  { value: 'ALL',               label: 'All Users' },
  { value: 'PENDING_APPROVALS', label: 'Pending Approvals' },
  { value: 'PAID',              label: 'Paid' },
  { value: 'UNPAID',            label: 'Unpaid / Free' },
  { value: 'FAILED',            label: 'Failed Payments' },
];

const PLAN_OPTIONS = [
  { value: 'FREE',         label: 'FREE (No Plan)' },
  { value: 'WEEKLY',       label: 'Weekly' },
  { value: 'MONTHLY',      label: 'Monthly' },
  { value: 'TWO_MONTH',    label: 'Two months' },
  { value: 'THREE_MONTH',  label: 'Three months' },
];

const planVariant = (plan?: string): 'brand' | 'success' | 'warn' | 'danger' | 'info' | 'mute' => {
  if (!plan || plan === 'NONE' || plan === 'FREE') return 'mute';
  if (plan === 'WEEKLY') return 'info';
  if (plan === 'MONTHLY') return 'brand';
  if (plan === 'TWO_MONTH') return 'warn';
  if (plan === 'THREE_MONTH') return 'success';
  return 'mute';
};

export default function UserManagement({ session }: { session: any }) {
  const toast = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingPlan, setEditingPlan] = useState('MONTHLY');
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [query, setQuery] = useState('');
  const [confirmSave, setConfirmSave] = useState<{ userId: string; plan: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await apiGet<{ users: any[] }>(`/admin/users`, session.access_token);
    if (res.ok) setUsers(res.data.users || []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [session]);

  const savePlan = async (userId: string, plan: string) => {
    const res = await apiPost('/admin/users/plan', { userId, planType: plan }, session.access_token);
    if (res.ok) {
      toast('Plan updated successfully', 'success');
      setEditingUserId(null);
      load();
    } else {
      toast(res.error, 'error');
    }
  };

  const filteredUsers = users.filter(user => {
    const hasActiveSub = user.subscriptions?.some((s: any) => s.status === 'ACTIVE');
    const hasFailedPayment = user.payments?.some((p: any) => p.status === 'FAILED');
    const hasPendingPayment = user.payments?.some((p: any) => p.status === 'PENDING');

    if (filter === 'PAID') return hasActiveSub;
    if (filter === 'UNPAID') return !hasActiveSub;
    if (filter === 'FAILED') return hasFailedPayment;
    if (filter === 'PENDING_APPROVALS') return hasPendingPayment;
    return true;
  }).filter(user => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      user.email?.toLowerCase().includes(q) ||
      user.full_name?.toLowerCase().includes(q) ||
      user.user_profiles?.[0]?.full_name?.toLowerCase().includes(q) ||
      user.user_profiles?.[0]?.phone?.toLowerCase().includes(q)
    );
  });

  const counts: Record<FilterType, number> = {
    ALL: users.length,
    PENDING_APPROVALS: users.filter(u => u.payments?.some((p: any) => p.status === 'PENDING')).length,
    PAID: users.filter(u => u.subscriptions?.some((s: any) => s.status === 'ACTIVE')).length,
    UNPAID: users.filter(u => !u.subscriptions?.some((s: any) => s.status === 'ACTIVE')).length,
    FAILED: users.filter(u => u.payments?.some((p: any) => p.status === 'FAILED')).length,
  };

  return (
    <div className="page">
      <PageHeader
        icon={<Users size={22} color="white" />}
        title="User Management"
        subtitle="View, filter, and override subscription plans."
        actions={
          <button className="btn btn-ghost" onClick={load} disabled={loading}>
            <RefreshCw size={14} /> Refresh
          </button>
        }
      />

      <div className="grid grid-stats stagger">
        <StatCard
          label="Total Users"
          value={counts.ALL}
          icon={<Users size={20} />}
          accent="info"
          hint="All registered accounts"
        />
        <StatCard
          label="Paid Users"
          value={counts.PAID}
          icon={<UserCheck size={20} />}
          accent="success"
          hint="Active subscriptions"
        />
        <StatCard
          label="Pending Approvals"
          value={counts.PENDING_APPROVALS}
          icon={<AlertTriangle size={20} />}
          accent="warn"
          hint="Awaiting verification"
        />
        <StatCard
          label="Failed Payments"
          value={counts.FAILED}
          icon={<XCircle size={20} />}
          accent="danger"
          hint="Need attention"
        />
      </div>

      <div className="card card-pad">
        <div className="row-between" style={{ marginBottom: 'var(--sp-3)' }}>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {FILTERS.map(f => (
              <button
                key={f.value}
                className={`chip${filter === f.value ? ' active' : ''}`}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
                <span style={{
                  background: filter === f.value ? 'rgba(255,255,255,0.25)' : 'var(--gray-100)',
                  color: filter === f.value ? 'white' : 'var(--text-muted)',
                  borderRadius: 'var(--r-pill)',
                  padding: '1px 8px',
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  marginLeft: 2,
                }}>{counts[f.value]}</span>
              </button>
            ))}
          </div>
          <div style={{ position: 'relative', minWidth: 240, maxWidth: 320, flex: 1 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-soft)', pointerEvents: 'none' }} />
            <input
              className="input"
              style={{ paddingLeft: 34 }}
              placeholder="Search email, name, phone…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="muted" style={{ fontSize: '0.75rem' }}>
          Showing <b style={{ color: 'var(--text)' }}>{filteredUsers.length}</b> of {users.length} users
        </div>
      </div>

      <div className="tbl-wrap">
        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th>User</th>
                <th>Contact</th>
                <th>Current Plan</th>
                <th>Status</th>
                <th className="right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6}><LoadingBlock label="Loading users…" /></td></tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={<FileSearch size={26} />}
                      title="No users match this filter"
                      description="Try changing the filter or clearing the search."
                    />
                  </td>
                </tr>
              ) : filteredUsers.map(user => {
                const activeSub = user.subscriptions?.find((s: any) => s.status === 'ACTIVE') || user.subscriptions?.[0];
                const isEditing = editingUserId === user.id;
                const isExpanded = expandedUserId === user.id;
                const profile = user.user_profiles?.[0];
                const hasFailed = user.payments?.some((p: any) => p.status === 'FAILED');
                const isActive = activeSub?.status === 'ACTIVE';

                return (
                  <React.Fragment key={user.id}>
                    <tr className={hasFailed ? 'row-danger' : ''}>
                      <td>
                        <button
                          className="btn-icon"
                          style={{ width: 28, height: 28 }}
                          onClick={() => setExpandedUserId(isExpanded ? null : user.id)}
                          aria-label={isExpanded ? 'Collapse' : 'Expand'}
                        >
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </td>
                      <td>
                        <div className="row">
                          <div className="avatar">{initials(profile?.full_name || user.email)}</div>
                          <div style={{ minWidth: 0 }}>
                            <div className="bold" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {truncate(user.email, 32)}
                              {hasFailed && <StatusPill variant="danger" dot={false}>failed</StatusPill>}
                            </div>
                            <div className="muted" style={{ fontSize: '0.72rem' }}>Joined {fmtDate(user.created_at || user.createdAt)}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div>{profile?.full_name || user.full_name || '—'}</div>
                        <div className="muted mono" style={{ fontSize: '0.72rem' }}>{profile?.phone || 'No phone'}</div>
                      </td>
                      <td>
                        {isEditing ? (
                          <select
                            className="select"
                            style={{ maxWidth: 160 }}
                            value={editingPlan}
                            onChange={(e) => setEditingPlan(e.target.value)}
                          >
                            {PLAN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        ) : (
                          <StatusPill variant={planVariant(activeSub?.plan_type)}>
                            {activeSub?.plan_type || 'NONE'}
                          </StatusPill>
                        )}
                      </td>
                      <td>
                        {isActive
                          ? <StatusPill variant="success">Active</StatusPill>
                          : <StatusPill variant="mute">Inactive</StatusPill>}
                      </td>
                      <td className="right">
                        {isEditing ? (
                          <div className="row" style={{ justifyContent: 'flex-end' }}>
                            <button className="btn btn-success btn-sm" onClick={() => setConfirmSave({ userId: user.id, plan: editingPlan })}>
                              <Save size={14} /> Save
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditingUserId(null)}>Cancel</button>
                          </div>
                        ) : (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => { setEditingUserId(user.id); setEditingPlan(activeSub?.plan_type || 'MONTHLY'); }}
                          >
                            <Edit2 size={14} /> Override
                          </button>
                        )}
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="row-expand">
                        <td colSpan={6}>
                          <div className="grid grid-cards" style={{ gap: 'var(--sp-6)' }}>
                            <div>
                              <div className="section-head" style={{ borderBottom: 'none', marginBottom: 'var(--sp-2)' }}>
                                <div className="section-head-icon" style={{ background: 'var(--info-50)', color: 'var(--info-600)' }}>
                                  <FileText size={14} />
                                </div>
                                <div className="section-head-title">Profile</div>
                              </div>
                              <ul className="stack" style={{ fontSize: '0.82rem' }}>
                                <li><span className="muted">User ID:</span> <span className="mono">{user.id}</span></li>
                                <li><span className="muted">Joined:</span> {fmtDate(user.created_at || user.createdAt)}</li>
                                <li><span className="muted">Role:</span> {profile?.currentRole || 'N/A'}</li>
                                <li><span className="muted">Experience:</span> {profile?.experienceLevel || 'N/A'}</li>
                                <li>
                                  <span className="muted">Skills: </span>
                                  {profile?.skills?.length
                                    ? profile.skills.map((s: string) => <span key={s} className="tag">{s}</span>)
                                    : <span className="muted">None</span>}
                                </li>
                                {profile?.resumeUrl && (
                                  <li>
                                    <a href={profile.resumeUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--brand-600)', fontWeight: 600 }}>
                                      View uploaded resume ↗
                                    </a>
                                  </li>
                                )}
                              </ul>
                            </div>

                            <div>
                              <div className="section-head" style={{ borderBottom: 'none', marginBottom: 'var(--sp-2)' }}>
                                <div className="section-head-icon" style={{ background: 'var(--warning-50)', color: 'var(--warning-600)' }}>
                                  <AlertTriangle size={14} />
                                </div>
                                <div className="section-head-title">Payment History</div>
                              </div>
                              {user.payments?.length ? (
                                <div className="stack" style={{ maxHeight: 180, overflowY: 'auto' }}>
                                  {user.payments.map((p: any) => (
                                    <div key={p.id} className="row-between" style={{ padding: '6px 0', borderBottom: '1px solid var(--border-soft)', fontSize: '0.78rem' }}>
                                      <div>
                                        <span className="muted">{fmtDate(p.createdAt)}</span>{' '}
                                        <span className="mono muted">{truncate(p.razorpayOrderId, 18)}</span>{' '}
                                        <StatusPill
                                          variant={p.status === 'COMPLETED' ? 'success' : p.status === 'FAILED' ? 'danger' : p.status === 'PENDING' ? 'info' : 'warn'}
                                        >
                                          {p.status}
                                        </StatusPill>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="muted" style={{ fontSize: '0.8rem' }}>No payment records.</div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        kind="confirm"
        open={!!confirmSave}
        onClose={() => setConfirmSave(null)}
        title="Override subscription plan?"
        description={confirmSave
          ? <>Set the user's plan to <b>{confirmSave.plan}</b>? This takes effect immediately.</>
          : null}
        confirmLabel="Yes, override"
        variant="warn"
        onConfirm={async () => {
          if (confirmSave) {
            await savePlan(confirmSave.userId, confirmSave.plan);
            setConfirmSave(null);
          }
        }}
      />
    </div>
  );
}
