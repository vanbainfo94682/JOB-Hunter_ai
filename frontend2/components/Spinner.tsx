import React from 'react';

export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return <span className={`spinner${size === 'lg' ? ' spinner-lg' : ''}`} role="status" aria-label="Loading" />;
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="empty">
      <Spinner size="lg" />
      <div className="empty-title">{label}</div>
    </div>
  );
}
