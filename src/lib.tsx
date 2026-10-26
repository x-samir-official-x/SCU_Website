import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, LoaderCircle, X } from 'lucide-react';
import type { Session, Status } from './types';

let csrf = '';
export function setCsrf(value: string) {
  csrf = value;
}
export async function api<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const bodyIsForm = options.body instanceof FormData;
  const response = await fetch(`/api${url}`, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body && !bodyIsForm ? { 'Content-Type': 'application/json' } : {}),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({ error: 'تعذر قراءة استجابة الخادم.' }));
  if (!response.ok) throw new Error(data.error || 'تعذر إتمام العملية.');
  return data;
}
export function useData<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    api<T>(url)
      .then((v) => {
        if (current) setData(v);
      })
      .catch((e) => {
        if (current) setError(e.message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [url, version]);
  return { data, setData, error, loading, reload: () => setVersion((v) => v + 1) };
}
export const SessionContext = createContext<{ session: Session; refresh: () => Promise<void> }>(
  {} as any,
);
export const useSession = () => useContext(SessionContext);
const ToastContext = createContext<(message: string, error?: boolean) => void>(() => {});
export const useToast = () => useContext(ToastContext);
export function useModalFocus(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          '.modal button:not(:disabled), .modal input:not(:disabled), .modal textarea:not(:disabled), .modal select:not(:disabled), .modal a[href]',
        ),
      ).filter((e) => e.getClientRects().length);
    const timer = setTimeout(() => focusable()[0]?.focus(), 0);
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key !== 'Tab') return;
      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', listener);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', listener);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [open]);
}
/** يُبقي العنصر في الصفحة مدة قصيرة بعد إغلاقه ليأخذ انتقال الخروج حقه. */
export function usePresence(show: boolean, exitMs = 180) {
  const [mounted, setMounted] = useState(show);
  useEffect(() => {
    if (show) {
      setMounted(true);
      return;
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = setTimeout(() => setMounted(false), reduce ? 0 : exitMs);
    return () => clearTimeout(timer);
  }, [show, exitMs]);
  return { render: show || mounted, state: show ? ('open' as const) : ('closed' as const) };
}
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; error: boolean; id: number } | null>(null);
  const [shown, setShown] = useState(false);
  const presence = usePresence(shown, 220);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setShown(false), 5000);
    return () => clearTimeout(timeout);
  }, [toast]);
  return (
    <ToastContext.Provider
      value={(message, error = false) => {
        setToast({ message, error, id: Date.now() });
        setShown(true);
      }}
    >
      {children}
      {presence.render && toast && (
        <div
          key={toast.id}
          data-state={presence.state}
          className={`toast ${toast.error ? 'error' : ''}`}
          role={toast.error ? 'alert' : 'status'}
        >
          {toast.error ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
          <span>{toast.message}</span>
          <button
            className="icon-button"
            onClick={() => setShown(false)}
            aria-label="إغلاق التنبيه"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}
export const statusNames: Record<Status, string> = {
  draft: 'مسودة',
  pending: 'قيد المراجعة',
  revision: 'مطلوب استكمال',
  approved: 'معتمد',
  rejected: 'لم يُعتمد',
  cancelled: 'ملغى',
};
export function Badge({ status }: { status: Status }) {
  return (
    <span className={`badge badge-${status}`}>
      <i />
      {statusNames[status]}
    </span>
  );
}
export const number = (n: number) => n.toLocaleString('ar-EG');
export const date = (value?: string | null) =>
  value
    ? new Date(value).toLocaleDateString('ar-EG', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Africa/Cairo',
      })
    : '—';
export const requestNumber = (id: number) => `ACT-${String(id).padStart(5, '0')}`;
export function Loading({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? 'loading compact' : 'loading'} role="status">
      <LoaderCircle className="spin" size={25} />
      <span>جارٍ تحميل البيانات…</span>
    </div>
  );
}
export function ErrorPanel({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="error-panel" role="alert">
      <AlertCircle size={24} />
      <p>{message}</p>
      {retry && (
        <button className="button secondary" onClick={retry}>
          إعادة المحاولة
        </button>
      )}
    </div>
  );
}
export function Empty({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
