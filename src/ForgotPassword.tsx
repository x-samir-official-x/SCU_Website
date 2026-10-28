import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, KeyRound, MailCheck } from 'lucide-react';
import { api, useSession } from './lib';

/** طلب رابط استعادة كلمة المرور. الرد واحد سواء وُجد الحساب أم لا. */
export function ForgotPasswordPage() {
  const { session } = useSession();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="verify-page" id="main-content" tabIndex={-1}>
      <section className="card verify-card">
        {!session.emailEnabled ? (
          <>
            <KeyRound size={44} className="verify-fail" aria-hidden="true" />
            <h1>استعادة كلمة المرور</h1>
            <p>
              الاستعادة بالبريد غير مفعّلة حاليًا. تواصل مع إدارة النشاط الطلابي لإعادة ضبط كلمة
              المرور.
            </p>
          </>
        ) : done ? (
          <>
            <MailCheck size={44} className="verify-ok" aria-hidden="true" />
            <h1>راجع بريدك</h1>
            <p>
              إذا كان هذا البريد مسجلًا عندنا، أرسلنا إليه رابطًا لاختيار كلمة مرور جديدة. الرابط
              صالح ساعة واحدة. لو لم تجده، افحص الرسائل غير المرغوب فيها.
            </p>
          </>
        ) : (
          <form onSubmit={submit} className="verify-form">
            <KeyRound size={44} className="verify-ok" aria-hidden="true" />
            <h1>نسيت كلمة المرور؟</h1>
            <p>اكتب بريدك الإلكتروني وسنرسل لك رابطًا لاختيار كلمة مرور جديدة.</p>
            <label>
              البريد الإلكتروني
              <input
                dir="ltr"
                type="email"
                required
                autoComplete="username"
                name="email"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.edu"
              />
            </label>
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <button className="button primary full" disabled={busy}>
              {busy ? 'جارٍ الإرسال…' : 'إرسال الرابط'}
            </button>
          </form>
        )}
        <Link className="text-button" to="/login">
          العودة إلى تسجيل الدخول
        </Link>
      </section>
    </main>
  );
}

/** صفحة الرابط الواصل بالبريد: اختيار كلمة مرور جديدة. */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) return setError('كلمة المرور ٨ أحرف على الأقل.');
    if (password !== again) return setError('كلمتا المرور غير متطابقتين.');
    setBusy(true);
    try {
      await api('/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="verify-page" id="main-content" tabIndex={-1}>
      <section className="card verify-card" aria-live="polite">
        {done ? (
          <>
            <CheckCircle2 size={44} className="verify-ok" aria-hidden="true" />
            <h1>تم تغيير كلمة المرور</h1>
            <p>سجّل دخولك الآن بكلمة المرور الجديدة.</p>
            <Link className="button primary" to="/login">
              تسجيل الدخول
            </Link>
          </>
        ) : !/^[a-f0-9]{64}$/.test(token) ? (
          <>
            <KeyRound size={44} className="verify-fail" aria-hidden="true" />
            <h1>الرابط ناقص</h1>
            <p>افتح الرابط من الرسالة كما وصلك، أو اطلب رابطًا جديدًا.</p>
            <Link className="button" to="/forgot-password">
              طلب رابط جديد
            </Link>
          </>
        ) : (
          <form onSubmit={submit} className="verify-form">
            <KeyRound size={44} className="verify-ok" aria-hidden="true" />
            <h1>اختر كلمة مرور جديدة</h1>
            <label>
              كلمة المرور الجديدة
              <input
                dir="ltr"
                type="password"
                required
                minLength={8}
                maxLength={100}
                autoComplete="new-password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <small className="field-hint">٨ أحرف على الأقل.</small>
            </label>
            <label>
              أعد كتابتها
              <input
                dir="ltr"
                type="password"
                required
                autoComplete="new-password"
                name="password-again"
                value={again}
                onChange={(e) => setAgain(e.target.value)}
              />
            </label>
            {error && (
              <div className="form-error" role="alert">
                {error}{' '}
                {/صلاحيته|غير صالح/.test(error) && (
                  <Link to="/forgot-password">اطلب رابطًا جديدًا</Link>
                )}
              </div>
            )}
            <button className="button primary full" disabled={busy}>
              {busy ? 'جارٍ الحفظ…' : 'حفظ كلمة المرور'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
