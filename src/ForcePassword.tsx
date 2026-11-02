import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, LogOut, ShieldCheck } from 'lucide-react';
import { api, logoSrc, useSession } from './lib';
import { weakPasswordReason } from './registration';

/** أول دخول بكلمة مرور مؤقتة: لا يُفتح أي شيء آخر قبل اختيار كلمة مرور خاصة. */
export function ForcePassword() {
  const { session, refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [invalid, setInvalid] = useState('');
  const [show, setShow] = useState(false);
  const user = session.user!;
  const expires = user.temp_expires_at
    ? new Date(user.temp_expires_at).toLocaleString('ar-EG', {
        dateStyle: 'full',
        timeStyle: 'short',
      })
    : '';
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    const confirm = String(form.get('confirm') ?? '');
    const problem =
      password.length < 8 || password.length > 100
        ? (['password', 'كلمة المرور من ٨ إلى ١٠٠ حرف.'] as const)
        : weakPasswordReason(password)
          ? (['password', weakPasswordReason(password)!] as const)
          : password !== confirm
            ? (['confirm', 'كلمتا المرور غير متطابقتين.'] as const)
            : null;
    if (problem) {
      setError(problem[1]);
      setInvalid(problem[0]);
      const field = event.currentTarget.elements.namedItem(problem[0]);
      if (field instanceof HTMLElement) field.focus();
      return;
    }
    setBusy(true);
    setError('');
    setInvalid('');
    try {
      await api('/profile/first-password', { method: 'PUT', body: JSON.stringify({ password }) });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    try {
      await api('/logout', { method: 'POST', body: '{}' });
    } finally {
      await refresh();
    }
  }
  return (
    <main className="lp-register" id="main-content" tabIndex={-1}>
      <section>
        <img
          src={logoSrc(session.faculty.logoPath)}
          width="2001"
          height="786"
          alt="شعار الجامعة والكلية"
        />
        <span className="lp-kicker">خطوة أخيرة</span>
        <h1>اختر كلمة مرور خاصة بك</h1>
        <p>
          أهلًا {user.name.split(' ')[0]}. دخلت بكلمة مرور مؤقتة، ولا يمكن متابعة استخدام الحساب قبل
          استبدالها.
        </p>
        {expires && (
          <div className="lp-temp-warn">
            <ShieldCheck size={22} />
            <p>
              تنتهي مهلة المؤقتة <strong>{expires}</strong>. إن لم تغيّرها قبل ذلك يُقفل التفعيل
              وتثبت هويتك من جديد.
            </p>
          </div>
        )}
        <form onSubmit={submit} noValidate className="lp-register-form">
          <label className="lp-span-2">
            كلمة المرور الجديدة
            <span className="lp-password">
              <input
                name="password"
                type={show ? 'text' : 'password'}
                dir="ltr"
                autoComplete="new-password"
                aria-invalid={invalid === 'password' ? true : undefined}
                maxLength={100}
                required
              />
              <button
                type="button"
                className="lp-password-toggle"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                aria-pressed={show}
              >
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
            <small>٨ أحرف على الأقل، ولا تكون شائعة (مثل 12345678) ولا تحتوي رقمك القومي.</small>
          </label>
          <label className="lp-span-2">
            أعد كتابة كلمة المرور
            <input
              name="confirm"
              type={show ? 'text' : 'password'}
              dir="ltr"
              autoComplete="new-password"
              aria-invalid={invalid === 'confirm' ? true : undefined}
              maxLength={100}
              required
            />
          </label>
          {error && (
            <p className="form-error lp-span-2" role="alert">
              {error}
            </p>
          )}
          <button className="lp-button lp-navy lp-span-2" disabled={busy}>
            {busy ? 'جارٍ الحفظ…' : 'حفظ والمتابعة'}
          </button>
        </form>
        <p className="lp-register-login">
          <button type="button" className="lp-link-button" onClick={logout}>
            <LogOut size={15} /> تسجيل الخروج
          </button>
        </p>
      </section>
    </main>
  );
}
