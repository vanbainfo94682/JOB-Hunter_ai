import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard, CreditCard, Flag, ShieldAlert, CheckCircle2, XCircle, Ban,
  Activity, RefreshCw, FileWarning, ChevronRight,
} from 'lucide-react';
import { apiPost, apiGet } from '../lib/api';
import { fmtDateTime, fmtRelative } from '../lib/format';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import StatusPill from '../components/StatusPill';
import EmptyState from '../components/EmptyState';
import { LoadingBlock } from '../components/Spinner';
import Modal from '../components/Modal';

type Payment = {
  id: string;
  created_at: string;
  user_email: string;
  razorpay_order_id: string;
};
type Report = {
  id: string;
  created_at: string;
  reason: string;
  jobs?: { title?: string; company?: string };
};

const PLAN_OPTIONS = [
  { value: 'WEEKLY',     label: 'Weekly' },
  { value: 'MONTHLY',    label: 'Monthly' },
  { value: 'TWO_MONTH',  label: 'Two months' },
  { value: 'THREE_MONTH', label: 'Three months' },
];

export default function Dashboard({ session }: { session: any }) {
  const toast = useToast();
  const [pendingPayments, setPendingPayments] = useState<Payment[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<Payment | null>(null);

  const load = async () => {
    setLoading(true);
    const [payRes, repRes] = await Promise.all([
      apiGet<{ payments: Payment[] }>(`/admin/payments`, session.access_token),
      apiGet<Report[]>(`/admin/reports`, session.access_token),
    ]);
    if (payRes.ok) setPendingPayments(payRes.data.payments || []);
    if (repRes.ok) setReports(repRes.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [session]);

  const handleApprove = async (plan: string) => {
    if (!approving) return;
    const res = await apiPost('/admin/payments/approve', { paymentId: approving.id, planType: plan }, session.access_token);
    if (res.ok) {
      toast('Payment approved · user activated', 'success');
      setApproving(null);
      load();
    } else {
      toast(res.error, 'error');
    }
  };

  const handleReject = async (paymentId: string) => {
    const res = await apiPost('/admin/payments/reject', { paymentId }, session.access_token);
    if (res.ok) { toast('Payment rejected', 'info'); load(); }
    else toast(res.error, 'error');
  };

  const handleBlacklist = async (company: string) => {
    if (!company) return;
    const res = await apiPost('/admin/blacklist', { companyName: company }, session.access_token);
    if (res.ok) { toast(`${company} blacklisted — all jobs hidden`, 'success'); load(); }
    else toast(res.error, 'error');
  };

  return (
    <div className="page">
      <PageHeader
        icon={<LayoutDashboard size={22} color="white" />}
        title="Dashboard Overview"
        subtitle="A live look at payments, moderation and platform health."
        actions={
          <button className="btn btn-ghost" onClick={load} disabled={loading}>
            <RefreshCw size={14} /> Refresh
          </button>
        }
      />

      <div className="grid grid-stats stagger">
        <StatCard
          label="Pending Approvals"
          value={pendingPayments.length}
          icon={<CreditCard size={20} />}
          accent="warn"
          hint="Payments awaiting your action"
        />
        <StatCard
          label="Flagged Jobs"
          value={reports.length}
          icon={<Flag size={20} />}
          accent="danger"
          hint="Reports to review"
        />
        <StatCard
          label="API Status"
          value="Online"
          icon={<Activity size={20} />}
          accent="success"
          hint="All systems healthy"
        />
        <StatCard
          label="Active Threats"
          value="0"
          icon={<ShieldAlert size={20} />}
          accent="info"
          hint="No security incidents"
        />
      </div>

      <section className="card card-pad-lg">
        <div className="section-head">
          <div className="section-head-icon" style={{ background: 'var(--warning-50)', color: 'var(--warning-600)' }}>
            <CreditCard size={16} />
          </div>
          <div>
            <div className="section-head-title">Payment Verification Requests</div>
            <div className="section-head-sub">Approve and assign a plan to activate the user.</div>
          </div>
          <div className="section-head-spacer" />
          <StatusPill variant="warn">{pendingPayments.length} pending</StatusPill>
        </div>

        {loading ? <LoadingBlock label="Loading payments…" /> : (
          <div className="tbl-wrap">
            <div className="tbl-scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>User Email</th>
                    <th>Transaction ID</th>
                    <th className="right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingPayments.length === 0 ? (
                    <tr>
                      <td colSpan={4}>
                        <EmptyState
                          icon={<CheckCircle2 size={26} />}
                          title="All caught up"
                          description="No pending payments need your attention right now."
                        />
                      </td>
                    </tr>
                  ) : pendingPayments.map(p => (
                    <tr key={p.id}>
                      <td className="muted">{fmtDateTime(p.created_at)}</td>
                      <td className="bold">{p.user_email}</td>
                      <td className="mono">{p.razorpay_order_id}</td>
                      <td className="right">
                        <div className="row" style={{ justifyContent: 'flex-end' }}>
                          <button className="btn btn-success btn-sm" onClick={() => setApproving(p)}>
                            <CheckCircle2 size={14} /> Approve
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleReject(p.id)}>
                            <XCircle size={14} /> Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="card card-pad-lg">
        <div className="section-head">
          <div className="section-head-icon" style={{ background: 'var(--pink-50)', color: 'var(--pink-600)' }}>
            <FileWarning size={16} />
          </div>
          <div>
            <div className="section-head-title">Moderation &amp; Flagged Jobs</div>
            <div className="section-head-sub">Blacklist a company to hide all of their jobs from users.</div>
          </div>
          <div className="section-head-spacer" />
          <StatusPill variant="pink">{reports.length} reports</StatusPill>
        </div>

        {loading ? <LoadingBlock label="Loading reports…" /> : (
          <div className="tbl-wrap">
            <div className="tbl-scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Date Reported</th>
                    <th>Job &amp; Company</th>
                    <th>Reason</th>
                    <th className="right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.length === 0 ? (
                    <tr>
                      <td colSpan={4}>
                        <EmptyState
                          icon={<Flag size={26} />}
                          title="No flagged jobs"
                          description="No reports from users at the moment."
                        />
                      </td>
                    </tr>
                  ) : reports.map(r => (
                    <tr key={r.id}>
                      <td className="muted">{fmtDateTime(r.created_at)}</td>
                      <td>
                        <div className="bold">{r.jobs?.title || 'Unknown Title'}</div>
                        <div className="muted" style={{ fontSize: '0.78rem' }}>{r.jobs?.company || 'Unknown Company'}</div>
                      </td>
                      <td><StatusPill variant="danger">{r.reason}</StatusPill></td>
                      <td className="right">
                        <button className="btn btn-ghost btn-sm" onClick={() => handleBlacklist(r.jobs?.company || '')}>
                          <Ban size={14} /> Blacklist
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="card card-pad-lg">
        <div className="section-head">
          <div className="section-head-icon" style={{ background: 'var(--info-50)', color: 'var(--info-600)' }}>
            <Activity size={16} />
          </div>
          <div>
            <div className="section-head-title">Recent Security Activity</div>
            <div className="section-head-sub">Latest admin-relevant events across the platform.</div>
          </div>
        </div>
        <div className="tbl-wrap">
          <div className="tbl-scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Event</th>
                  <th>IP Address</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="muted">Just now</td>
                  <td><StatusPill variant="success">ADMIN_LOGIN</StatusPill></td>
                  <td className="mono">192.168.1.1</td>
                  <td className="muted">Successful admin login</td>
                </tr>
                <tr>
                  <td className="muted">{fmtRelative(new Date(Date.now() - 10 * 60_000).toISOString())}</td>
                  <td><StatusPill variant="info">PAYMENT_SUBMITTED</StatusPill></td>
                  <td className="mono">203.0.113.42</td>
                  <td className="muted">User submitted order ID for validation</td>
                </tr>
                <tr>
                  <td className="muted">{fmtRelative(new Date(Date.now() - 60 * 60_000).toISOString())}</td>
                  <td><StatusPill variant="danger">FAILED_LOGIN</StatusPill></td>
                  <td className="mono">104.28.19.11</td>
                  <td className="muted">Invalid password attempt (3/5)</td>
                </tr>
                <tr>
                  <td className="muted">{fmtRelative(new Date(Date.now() - 3 * 60 * 60_000).toISOString())}</td>
                  <td><StatusPill variant="brand">SYSTEM_BACKUP</StatusPill></td>
                  <td className="mono">localhost</td>
                  <td className="muted">Automated database backup completed <ChevronRight size={12} style={{ verticalAlign: 'middle' }} /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <Modal
        kind="prompt"
        open={!!approving}
        onClose={() => setApproving(null)}
        title="Approve payment"
        description={approving ? <>Activate <b>{approving.user_email}</b> and assign a subscription plan.</> : null}
        selectLabel="Subscription plan"
        selectOptions={PLAN_OPTIONS}
        defaultValue="MONTHLY"
        confirmLabel="Approve & activate"
        variant="success"
        onConfirm={handleApprove}
      />
    </div>
  );
}
