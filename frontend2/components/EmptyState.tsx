import React from 'react';
import { Inbox } from 'lucide-react';

type Props = {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
};

export default function EmptyState({ title = 'Nothing here yet', description, icon, action }: Props) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon ?? <Inbox size={26} />}</div>
      <div className="empty-title">{title}</div>
      {description && <div className="empty-desc">{description}</div>}
      {action}
    </div>
  );
}
