import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

type Accent = 'brand' | 'success' | 'warn' | 'danger' | 'info' | 'violet' | 'pink';

const accentMap: Record<Accent, { bg: string; fg: string; grad: string }> = {
  brand:  { bg: 'var(--brand-50)',   fg: 'var(--brand-600)',   grad: 'var(--brand-500)' },
  success: { bg: 'var(--success-50)', fg: 'var(--success-600)', grad: 'var(--success-500)' },
  warn:   { bg: 'var(--warning-50)', fg: 'var(--warning-600)', grad: 'var(--warning-500)' },
  danger: { bg: 'var(--danger-50)',  fg: 'var(--danger-600)',  grad: 'var(--danger-500)' },
  info:   { bg: 'var(--info-50)',    fg: 'var(--info-600)',    grad: 'var(--info-500)' },
  violet: { bg: 'var(--violet-50)',  fg: 'var(--violet-600)',  grad: 'var(--violet-500)' },
  pink:   { bg: 'var(--pink-50)',    fg: 'var(--pink-600)',    grad: 'var(--pink-500)' },
};

type Props = {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  accent?: Accent;
  trend?: { dir: 'up' | 'down'; text: string };
  hint?: string;
};

export default function StatCard({ label, value, icon, accent = 'brand', trend, hint }: Props) {
  const a = accentMap[accent];
  const style = {
    ['--accent']: a.grad,
    ['--accent-bg']: a.bg,
    ['--accent-fg']: a.fg,
  } as React.CSSProperties;
  return (
    <div className="stat" style={style}>
      <div className="row-between">
        <div className="stat-label">{label}</div>
        <div className="stat-icon">{icon}</div>
      </div>
      <div className="stat-value">{value}</div>
      {(trend || hint) && (
        <div className="stat-foot">
          {trend && (
            <span className={`stat-trend stat-trend-${trend.dir === 'up' ? 'up' : 'down'}`}>
              {trend.dir === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {trend.text}
            </span>
          )}
          {hint && <span className="muted">{hint}</span>}
        </div>
      )}
    </div>
  );
}
