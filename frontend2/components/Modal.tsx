import React, { useEffect, useState } from 'react';
import { X, AlertTriangle, Info, ShieldAlert, CheckCircle2 } from 'lucide-react';

type Variant = 'danger' | 'warn' | 'info' | 'success';

type BaseProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: Variant;
};

type ConfirmProps = BaseProps & {
  kind: 'confirm';
  onConfirm: () => void | Promise<void>;
  busy?: boolean;
};

type PromptProps = BaseProps & {
  kind: 'prompt';
  onConfirm: (value: string) => void | Promise<void>;
  defaultValue?: string;
  placeholder?: string;
  selectOptions?: { value: string; label: string }[];
  selectLabel?: string;
  busy?: boolean;
};

export type ModalProps = ConfirmProps | PromptProps;

const variantMeta: Record<Variant, { icon: React.ReactNode; cls: string }> = {
  danger:  { icon: <ShieldAlert size={20} />,     cls: 'icon-danger' },
  warn:    { icon: <AlertTriangle size={20} />,  cls: 'icon-warn' },
  info:    { icon: <Info size={20} />,            cls: 'icon-info' },
  success: { icon: <CheckCircle2 size={20} />,    cls: 'icon-warn' },
};

export default function Modal(props: ModalProps) {
  const { open, onClose, title, description, confirmLabel = 'Confirm', cancelLabel = 'Cancel', variant = 'warn' } = props;
  const [value, setValue] = useState<string>(props.kind === 'prompt' ? (props.defaultValue ?? '') : '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(props.kind === 'prompt' ? (props.defaultValue ?? '') : '');
      setBusy(false);
    }
  }, [open, props]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const v = variantMeta[variant];

  const handleConfirm = async () => {
    if (busy) return;
    if (props.kind === 'prompt' && !value.trim()) return;
    setBusy(true);
    try {
      if (props.kind === 'confirm') {
        await props.onConfirm();
      } else {
        await props.onConfirm(value);
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmClass = variant === 'danger' ? 'btn-danger' : variant === 'success' ? 'btn-success' : 'btn-primary';

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <div className={`modal-icon ${v.cls}`}>{v.icon}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>{title}</div>
          </div>
          <button className="btn-icon" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {description && <div className="modal-body">{description}</div>}

        {props.kind === 'prompt' && (
          <div className="modal-body" style={{ paddingTop: 0 }}>
            {props.selectOptions ? (
              <div className="field">
                {props.selectLabel && <label className="label">{props.selectLabel}</label>}
                <select className="select" value={value} onChange={(e) => setValue(e.target.value)}>
                  {props.selectOptions.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="field">
                {props.selectLabel && <label className="label">{props.selectLabel}</label>}
                <input
                  className="input"
                  autoFocus
                  value={value}
                  placeholder={props.placeholder}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); }}
                />
              </div>
            )}
          </div>
        )}

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>{cancelLabel}</button>
          <button className={`btn ${confirmClass}`} onClick={handleConfirm} disabled={busy || (props.kind === 'prompt' && !value.trim())}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
