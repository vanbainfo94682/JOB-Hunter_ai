import React from 'react';

type Variant = 'success' | 'warn' | 'danger' | 'info' | 'brand' | 'violet' | 'pink' | 'mute';

export default function StatusPill({
  variant = 'mute',
  children,
  dot = true,
  className = '',
}: {
  variant?: Variant;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span className={`pill pill-${variant} ${className}`}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}
