import React, { createContext, useCallback, useContext, useState, useRef } from 'react';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'info' | 'warn';

type Toast = {
  id: number;
  message: string;
  variant: ToastVariant;
};

type ToastFn = (message: string, variant?: ToastVariant) => void;

const ToastCtx = createContext<ToastFn>(() => {});

export function useToast(): ToastFn {
  return useContext(ToastCtx);
}

const iconFor = (v: ToastVariant) => {
  if (v === 'success') return <CheckCircle2 size={18} />;
  if (v === 'error')   return <XCircle size={18} />;
  if (v === 'warn')    return <AlertTriangle size={18} />;
  return <Info size={18} />;
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const push = useCallback<ToastFn>((message, variant = 'info') => {
    const id = ++seq.current;
    setToasts(prev => [...prev, { id, message, variant }]);
    window.setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3800);
  }, []);

  const dismiss = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-host" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.variant}`}>
            <span className="toast-icon">{iconFor(t.variant)}</span>
            <div className="toast-msg">{t.message}</div>
            <button className="toast-close btn-icon" onClick={() => dismiss(t.id)} aria-label="Dismiss" style={{ width: 24, height: 24, border: 'none', background: 'transparent' }}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
