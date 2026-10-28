import { useState } from 'react';
import { MailCheck } from 'lucide-react';
import { api, useSession, useToast } from './lib';

/** يظهر للطالب إذا كان إرسال البريد مفعّلًا على الخادم ولم يؤكد بريده بعد. */
export function EmailVerifyBanner() {
  const { session } = useSession();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const user = session.user;
  if (!session.emailEnabled || !user || user.role !== 'student' || user.email_verified) return null;
  async function resend() {
    setBusy(true);
    try {
      await api('/profile/resend-verification', { method: 'POST', body: '{}' });
      setSent(true);
      toast('أرسلنا رابط التأكيد إلى بريدك.');
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="verify-banner" role="status">
      <MailCheck size={22} aria-hidden="true" />
      <div>
        <strong>أكّد بريدك الإلكتروني</strong>
        <p>
          عشان يوصلك إشعار على بريدك لما يتم اتخاذ قرار في طلبك. أرسلنا رابطًا إلى{' '}
          <bdi dir="ltr">{user.email}</bdi>، وافتحه لإتمام التأكيد.
        </p>
      </div>
      <button type="button" className="button secondary" disabled={busy || sent} onClick={resend}>
        {sent ? 'تم الإرسال' : 'أرسل الرابط مرة أخرى'}
      </button>
    </div>
  );
}
