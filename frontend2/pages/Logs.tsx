import React, { useState, useEffect } from 'react';
import { Activity, Search, RefreshCw, FileSearch, Info, CheckCircle2, AlertTriangle, XCircle, ShieldAlert } from 'lucide-react';
import { apiGet } from '../lib/api';
import { fmtDateTime } from '../lib/format';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { LoadingBlock } from '../components/Spinner';

type Level = 'ALL' | 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'SECURITY';

const LEVELS: Level[] = ['ALL', 'INFO', 'SUCCESS', 'WARNING', 'ERROR', 'SECURITY'];

const levelIcon = (lvl: string) => {
  if (lvl === 'INFO')    return <Info size={12} />;
  if (lvl === 'SUCCESS') return <CheckCircle2 size={12} />;
  if (lvl === 'WARNING') return <AlertTriangle size={12} />;
  if (lvl === 'ERROR')   return <XCircle size={12} />;
  if (lvl === 'SECURITY') return <ShieldAlert size={12} />;
  return <Activity size={12} />;
};

export default function Logs({ session }: { session: any }) {
  const toast = useToast();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState<Level>('ALL');
  const [query, setQuery] = useState('');

  const load = async () => {
    setLoading(true);
    const res = await apiGet<{ logs: any[] }>(`/admin/logs`, session.access_token);
    if (res.ok) setLogs(res.data.logs || []);
    else toast(res.error, 'error');
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [session]);

  const filtered = logs.filter(l => {
    if (level !== 'ALL' && l.level !== level) return false;
    if (query && !l.message?.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="page">
      <PageHeader
        icon={<Activity size={22} color="white" />}
        title="System Logs"
        subtitle="Stream of platform events — filter by level or search for a keyword."
        actions={
          <button className="btn btn-ghost" onClick={load} disabled={loading}>
            <RefreshCw size={14} /> Refresh
          </button>
        }
      />

      <div className="card card-pad">
        <div className="row-between" style={{ gap: 'var(--sp-4)' }}>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {LEVELS.map(l => (
              <button
                key={l}
                className={`chip${level === l ? ' active' : ''}`}
                onClick={() => setLevel(l)}
              >
                <span className={`log-level log-${l}`} style={{ padding: 0, background: 'transparent' }}>
                  <span className="dot" />
                  {l === 'ALL' ? 'All levels' : l.charAt(0) + l.slice(1).toLowerCase()}
                </span>
              </button>
            ))}
          </div>
          <div style={{ position: 'relative', minWidth: 260, maxWidth: 360, flex: 1 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-soft)', pointerEvents: 'none' }} />
            <input
              className="input"
              style={{ paddingLeft: 34 }}
              placeholder="Search messages…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="muted" style={{ fontSize: '0.75rem', marginTop: 'var(--sp-2)' }}>
          Showing <b style={{ color: 'var(--text)' }}>{filtered.length}</b> of {logs.length} entries
        </div>
      </div>

      <div className="tbl-wrap">
        {loading ? (
          <LoadingBlock label="Loading logs…" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<FileSearch size={26} />}
            title="No logs match your filters"
            description="Try a different level or clear the search box."
          />
        ) : (
          <div className="tbl-scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 180 }}>Timestamp</th>
                  <th style={{ width: 130 }}>Level</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(log => (
                  <tr key={log.id}>
                    <td className="muted mono" style={{ fontSize: '0.78rem' }}>{fmtDateTime(log.timestamp)}</td>
                    <td>
                      <span className={`log-level log-${log.level}`}>
                        <span className="dot" />
                        {levelIcon(log.level)}
                        {log.level}
                      </span>
                    </td>
                    <td className="log-row">{log.message}</td>
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
