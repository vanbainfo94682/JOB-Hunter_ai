import React from 'react';

type Props = {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
};

export default function PageHeader({ icon, title, subtitle, actions }: Props) {
  return (
    <div className="page-head">
      <div className="page-head-icon">{icon}</div>
      <div className="page-head-text">
        <h1 className="page-title">{title}</h1>
        {subtitle && <div className="page-sub">{subtitle}</div>}
      </div>
      <div className="page-head-spacer" />
      {actions && <div className="page-head-actions">{actions}</div>}
    </div>
  );
}
