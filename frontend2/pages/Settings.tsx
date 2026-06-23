import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon, AlertTriangle, ShieldAlert, Users, Lock, Bell, Save,
  Server, Power, Info, Globe,
} from 'lucide-react';
import { apiGet, apiPost } from '../lib/api';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import { LoadingBlock } from '../components/Spinner';
import Modal from '../components/Modal';

type ConfirmAction = {
  title: string;
  description: string;
  variant: 'danger' | 'warn' | 'info' | 'success';
  confirmLabel: string;
  action: () => Promise<void> | void;
} | null;

export default function Settings({ session }: { session: any }) {
  const toast = useToast();
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [confirm, setConfirm] = useState<ConfirmAction>(null);

  useEffect(() => { fetchSettings(); /* eslint-disable-next-line */ }, []);

  async function fetchSettings() {
    setLoading(true);
    const res = await apiGet<{ maintenanceMode: boolean }>(`/system/status`);
    if (res.ok) setMaintenanceMode(!!res.data.maintenanceMode);
    setLoading(false);
  }

  async function applyMaintenance(value: boolean) {
    setSaving(true);
    const res = await apiPost('/admin/system/config', { key: 'maintenanceMode', value: value ? 'true' : 'false' }, session.access_token);
    if (res.ok) {
      setMaintenanceMode(value);
      toast(value ? 'Maintenance mode is ON' : 'Maintenance mode is OFF', value ? 'warn' : 'success');
    } else {
      toast(res.error, 'error');
    }
    setSaving(false);
  }

  const askMaintenance = () => {
    if (saving) return;
    if (maintenanceMode) {
      setConfirm({
        title: 'Turn OFF maintenance mode?',
        description: 'Normal users will regain access to the application immediately.',
        variant: 'success',
        confirmLabel: 'Yes, turn it off',
        action: async () => { await applyMaintenance(false); setConfirm(null); },
      });
    } else {
      setConfirm({
        title: 'Turn ON maintenance mode?',
        description: <>This will display an <b>“Under Maintenance”</b> screen to all visitors and registered users. Only admins will retain access.</>,
        variant: 'danger',
        confirmLabel: 'Yes, take site offline',
        action: async () => { await applyMaintenance(true); setConfirm(null); },
      });
    }
  };

  const saveAnnouncement = async () => {
    if (!announcement.trim()) { toast('Banner is empty', 'warn'); return; }
    setConfirm({
      title: 'Publish announcement banner?',
      description: 'All logged-in users will see this banner at the top of their dashboard.',
      variant: 'info',
      confirmLabel: 'Publish',
      action: async () => {
        const res = await apiPost('/admin/announcement', { message: announcement }, session.access_token);
        if (res.ok) { toast('Announcement published', 'success'); setAnnouncement(''); }
        else toast(res.error + ' (backend may not be wired yet)', 'warn');
        setConfirm(null);
      },
    });
  };

  return (
    <div className="page">
      <PageHeader
        icon={<SettingsIcon size={22} color="white" />}
        title="Security & Network"
        subtitle="Control who can access the platform and how it behaves."
      />

      {loading ? <LoadingBlock label="Loading settings…" /> : (
        <>
          <section className="card card-pad-lg">
            <div className="section-head">
              <div className="section-head-icon" style={{ background: 'var(--danger-50)', color: 'var(--danger-600)' }}>
                <ShieldAlert size={16} />
              </div>
              <div>
                <div className="section-head-title">System Maintenance Mode</div>
                <div className="section-head-sub">Take the platform offline for critical work.</div>
              </div>
              <div className="section-head-spacer" />
              <StatusPill variant={maintenanceMode ? 'danger' : 'success'}>
                {maintenanceMode ? (<><AlertTriangle size={12} /> ACTIVE</>) : 'INACTIVE'}
              </StatusPill>
            </div>

            <div className="setting-item">
              <div className="setting-icon" style={{ background: 'var(--danger-50)', color: 'var(--danger-600)' }}>
                <Power size={18} />
              </div>
              <div className="setting-body">
                <div className="setting-title">Maintenance toggle</div>
                <div className="setting-desc">
                  When enabled, the frontend will display an “Under Maintenance” screen to all visitors and registered users. Use this when performing critical database upgrades or fixing severe bugs.
                </div>
              </div>
              <div className="setting-action">
                <label className="switch">
                  <input type="checkbox" checked={maintenanceMode} onChange={askMaintenance} disabled={saving} />
                  <span className="track" />
                </label>
              </div>
            </div>
          </section>

          <section className="card card-pad-lg">
            <div className="section-head">
              <div className="section-head-icon" style={{ background: 'var(--info-50)', color: 'var(--info-600)' }}>
                <Users size={16} />
              </div>
              <div>
                <div className="section-head-title">Access &amp; Registration</div>
                <div className="section-head-sub">Control who can sign up and what they see.</div>
              </div>
            </div>

            <div className="setting-item">
              <div className="setting-icon" style={{ background: 'var(--info-50)', color: 'var(--info-600)' }}>
                <Users size={18} />
              </div>
              <div className="setting-body">
                <div className="setting-title">User Registration</div>
                <div className="setting-desc">
                  Allow new users to register for the platform. Disable during private beta or when managing server load.
                </div>
              </div>
              <div className="setting-action">
                <StatusPill variant="success">Enabled</StatusPill>
              </div>
            </div>

            <div className="setting-item">
              <div className="setting-icon" style={{ background: 'var(--warning-50)', color: 'var(--warning-600)' }}>
                <Bell size={18} />
              </div>
              <div className="setting-body">
                <div className="setting-title">Global Announcement Banner</div>
                <div className="setting-desc">
                  Display a critical banner at the top of the frontend dashboard — useful for downtime warnings or promos.
                </div>
                <div className="field" style={{ marginTop: 'var(--sp-3)' }}>
                  <textarea
                    className="textarea"
                    placeholder="e.g. Scheduled maintenance on Sunday 2–3 AM IST"
                    value={announcement}
                    onChange={(e) => setAnnouncement(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="row" style={{ marginTop: 'var(--sp-2)' }}>
                  <button className="btn btn-primary btn-sm" onClick={saveAnnouncement}>
                    <Save size={14} /> Publish banner
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setAnnouncement('')}>Clear</button>
                </div>
              </div>
            </div>
          </section>

          <section className="card card-pad-lg">
            <div className="section-head">
              <div className="section-head-icon" style={{ background: 'var(--violet-50)', color: 'var(--violet-600)' }}>
                <Lock size={16} />
              </div>
              <div>
                <div className="section-head-title">Application Firewall &amp; Rate Limiting</div>
                <div className="section-head-sub">Protect the API from abuse and unauthorized regions.</div>
              </div>
            </div>

            <div className="setting-item">
              <div className="setting-icon" style={{ background: 'var(--violet-50)', color: 'var(--violet-600)' }}>
                <Server size={18} />
              </div>
              <div className="setting-body">
                <div className="setting-title">API Rate Limit</div>
                <div className="setting-desc">Max requests per minute per client.</div>
              </div>
              <div className="setting-action">
                <select className="select" style={{ minWidth: 180 }} defaultValue="Standard (100 req/min)">
                  <option>Standard (100 req/min)</option>
                  <option>Strict (50 req/min)</option>
                  <option>Unlimited</option>
                </select>
              </div>
            </div>

            <div className="setting-item">
              <div className="setting-icon" style={{ background: 'var(--violet-50)', color: 'var(--violet-600)' }}>
                <Globe size={18} />
              </div>
              <div className="setting-body">
                <div className="setting-title">Geo-Blocking</div>
                <div className="setting-desc">Block traffic from high-risk countries.</div>
              </div>
              <div className="setting-action">
                <select className="select" style={{ minWidth: 180 }} defaultValue="Disabled">
                  <option>Disabled</option>
                  <option>Block High-Risk Countries</option>
                </select>
              </div>
            </div>

            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 'var(--sp-3)' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => toast('WAF policy saved (mock)', 'success')}>
                <Save size={14} /> Save policies
              </button>
            </div>
          </section>

          <div className="row" style={{ justifyContent: 'center' }}>
            <span className="muted" style={{ fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Info size={12} /> Settings persist via the VANBA admin API. Some controls require backend wiring.
            </span>
          </div>
        </>
      )}

      <Modal
        kind="confirm"
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.title || ''}
        description={confirm?.description as any}
        confirmLabel={confirm?.confirmLabel}
        variant={confirm?.variant}
        onConfirm={async () => { if (confirm) await confirm.action(); }}
      />
    </div>
  );
}
