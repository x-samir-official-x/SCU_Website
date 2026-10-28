import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, LoaderCircle, X } from 'lucide-react';
import type { Session, Status } from './types';

/** نسخة WebP خفيفة من الشعار للواجهة؛ ملف PNG الأصلي يبقى للاستمارة المطبوعة. */
export const logoSrc = (path: string) => path.replace(/\.png$/i, '.webp');

export const SESSION_EXPIRED = 'athar-session-expired';
let csrf = '';
export function setCsrf(value: string) {
  csrf = value;
}
export async function api<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const bodyIsForm = options.body instanceof FormData;
  let response: Response;
  try {
    response = await fetch(`/api${url}`, {
      credentials: 'same-origin',
      ...options,
      headers: {
        ...(options.body && !bodyIsForm ? { 'Content-Type': 'application/json' } : {}),
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        ...options.headers,
      },
    });
  } catch {
    // انقطاع الإنترنت أو توقف الخادم: رسالة عربية بدل رسالة المتصفح الإنجليزية
    throw new Error('تعذر الاتصال. تأكد من اتصالك بالإنترنت ثم حاول مرة أخرى.');
  }
  const data = await response.json().catch(() => ({ error: 'تعذر قراءة استجابة الخادم.' }));
  if (!response.ok) {
    // جلسة منتهية أثناء الاستخدام: نبلّغ التطبيق ليعيد المستخدم لصفحة الدخول
    if (response.status === 401 && csrf && url !== '/login') {
      try {
        sessionStorage.setItem(SESSION_EXPIRED, '1');
      } catch {
        /* لا مشكلة */
      }
      window.dispatchEvent(new Event(SESSION_EXPIRED));
    }
    throw new Error(data.error || 'تعذر إتمام العملية.');
  }
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
  if (compact)
    return (
      <div className="loading compact" role="status">
        <LoaderCircle className="spin" size={25} />
        <span>جارٍ تحميل البيانات…</span>
      </div>
    );
  return (
    <div className="loading" role="status" aria-busy="true">
      <span className="sk sk-title" />
      <span className="sk sk-line" />
      <span className="sk sk-hero" />
      <div className="sk-grid">
        <span className="sk sk-card" />
        <span className="sk sk-card" />
        <span className="sk sk-card" />
      </div>
      <span className="sk sk-panel" />
      <span className="sr-only">جارٍ التحميل…</span>
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
/**
 * يجهّز صورة المعرض داخل المتصفح قبل رفعها: يصحح الاتجاه، ويصغّرها (حتى ١٦٠٠ بكسل)،
 * ويعيد ترميزها JPEG، فتسقط كل البيانات الوصفية (الموقع، الكاميرا، التاريخ…).
 */
export async function prepareGalleryImage(file: File): Promise<File> {
  if (!['image/jpeg', 'image/png'].includes(file.type)) throw new Error('اختر صورة JPG أو PNG.');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => {
    throw new Error('تعذر قراءة الصورة. اختر صورة سليمة.');
  });
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.86),
  );
  if (!blob) throw new Error('تعذر تجهيز الصورة.');
  return new File([blob], 'gallery.jpg', { type: 'image/jpeg' });
}

/** صورة شخصية: قص مربع من المنتصف، تصغير إلى ٢٥٦ بكسل، وإعادة ترميز JPEG (يزيل البيانات الوصفية). */
export async function prepareAvatar(file: File): Promise<File> {
  if (!['image/jpeg', 'image/png'].includes(file.type)) throw new Error('اختر صورة JPG أو PNG.');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => {
    throw new Error('تعذر قراءة الصورة. اختر صورة سليمة.');
  });
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.min(256, side);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.88),
  );
  if (!blob) throw new Error('تعذر تجهيز الصورة.');
  return new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
}
