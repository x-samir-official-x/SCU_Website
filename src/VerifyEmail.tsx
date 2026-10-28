import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, MailWarning } from 'lucide-react';
import { api, useSession } from './lib';

/** صفحة رابط تأكيد البريد (عامة). التأكيد يتم بطلب POST حتى لا تفعّله برامج فحص الروابط تلقائيًا. */
export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const { session, refresh } = useSession();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'wait' | 'ok' | 'fail'>('wait');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let alive = true;
    if (!token) {
      setState('fail');
      setMessage('الرابط ناقص. افتح الرابط من الرسالة كما وصلك.');
      return;
    }
    api('/verify-email', { method: 'POST', body: JSON.stringify({ token }) })
      .then(async () => {
        if (!alive) return;
        setState('ok');
        await refresh();
      })
      .catch((e: Error) => {
        if (!alive) return;
        setState('fail');
        setMessage(e.message);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  return (
    <main className="verify-page" id="main-content" tabIndex={-1}>
      <section className="card verify-card" aria-live="polite">
        {state === 'wait' && <h1>جارٍ تأكيد بريدك…</h1>}
        {state === 'ok' && (
          <>
            <CheckCircle2 size={44} className="verify-ok" aria-hidden="true" />
            <h1>تم تأكيد بريدك الإلكتروني</h1>
            <p>هيوصلك من الآن إشعار على بريدك لما يكون فيه جديد في طلبك.</p>
          </>
        )}
        {state === 'fail' && (
          <>
            <MailWarning size={44} className="verify-fail" aria-hidden="true" />
            <h1>تعذر تأكيد البريد</h1>
            <p>{message}</p>
          </>
        )}
        {state !== 'wait' && (
          <Link className="button" to={session.user ? '/dashboard' : '/login'}>
            {session.user ? 'الذهاب إلى حسابي' : 'تسجيل الدخول'}
          </Link>
        )}
      </section>
    </main>
  );
}
