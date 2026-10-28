import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { api, date } from './lib';
import type { AppNotification } from './types';

/** جرس الإشعارات: عدّاد غير المقروء، وقائمة آخر الإشعارات. يتحدث كل دقيقة وعند فتح القائمة. */
export function NotificationBell() {
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    try {
      const data = await api<{ notifications: AppNotification[]; unread: number }>(
        '/notifications',
      );
      setItems(data.notifications);
      setUnread(data.unread);
    } catch {
      /* الجرس لا يجب أن يعطل الصفحة */
    }
  }, []);
  useEffect(() => {
    load();
    const timer = window.setInterval(load, 60_000);
    const visible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [load]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  async function markRead(id?: number) {
    await api('/notifications/read', { method: 'POST', body: JSON.stringify(id ? { id } : {}) });
    await load();
  }
  async function openItem(n: AppNotification) {
    if (!n.read) await markRead(n.id);
    setOpen(false);
    if (n.link) navigate(n.link);
  }
  return (
    <div className="notif-wrap" ref={wrap}>
      <button
        type="button"
        className="icon-button notification"
        aria-label={unread ? `الإشعارات، ${unread} غير مقروء` : 'الإشعارات'}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          if (!open) load();
        }}
      >
        <Bell size={19} />
        {unread > 0 && <span className="notif-count">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="notif-panel" role="region" aria-label="الإشعارات">
          <div className="notif-head">
            <strong>الإشعارات</strong>
            {unread > 0 && (
              <button type="button" onClick={() => markRead()}>
                <CheckCheck size={14} aria-hidden="true" /> تعليم الكل كمقروء
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="notif-empty">
              لا توجد إشعارات بعد. هتظهر هنا قرارات المراجعة والتنبيهات.
            </p>
          ) : (
            <ul>
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={n.read ? '' : 'is-unread'}
                    onClick={() => openItem(n)}
                  >
                    <strong>{n.title}</strong>
                    {n.body && <span>{n.body}</span>}
                    <small>{date(n.created_at)}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
