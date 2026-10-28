import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  BadgeCheck,
  Camera,
  ClipboardCheck,
  GraduationCap,
  KeyRound,
  LogOut,
  Mail,
  ScrollText,
} from 'lucide-react';
import { Avatar } from './Avatar';
import {
  api,
  Badge,
  prepareAvatar,
  date,
  Empty,
  ErrorPanel,
  Loading,
  number,
  useData,
  useSession,
  useToast,
} from './lib';
import { MissionCard } from './MissionCard';
import { EmailVerifyBanner } from './EmailVerifyBanner';
import { YEARS } from './registration';
import { TERMS } from './terms';
import type { ActivityRequest, Status } from './types';

interface ProfileData {
  profile: {
    name: string;
    email: string;
    phone: string | null;
    year: string | null;
    idShown: string | null;
    hasUniversityId: boolean;
    hasNationalId: boolean;
    createdAt: string;
    termsVersion: string | null;
    termsAcceptedAt: string | null;
  };
  history: {
    id: number;
    period: string;
    title: string;
    status: Status;
    points: number;
    submitted_at: string | null;
  }[];
  totalPoints: number;
}

/** الملف الشخصي للطالب: بيانات الحساب، الأمان، وسجل المشاركات. بيانات الهوية الرسمية للعرض فقط. */
export function ProfilePage() {
  const { session, refresh } = useSession();
  const toast = useToast();
  const state = useData<ProfileData>('/profile');
  const mine = useData<{ request: ActivityRequest | null }>('/requests/mine');
  const [busy, setBusy] = useState('');
  const [pw, setPw] = useState({ current: '', password: '', again: '' });
  const [uid, setUid] = useState('');
  const [phone, setPhone] = useState<string | null>(null);
  const [mail, setMail] = useState({ email: '', password: '' });
  const fileRef = useRef<HTMLInputElement>(null);
  const [termsOpen, setTermsOpen] = useState(false);
  if (state.loading || mine.loading) return <Loading />;
  if (state.error) return <ErrorPanel message={state.error} retry={state.reload} />;
  const { profile, history, totalPoints } = state.data!;
  const max = session.faculty.points;

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    try {
      await fn();
      toast(ok);
      await refresh();
      state.reload();
      return true;
    } catch (e) {
      toast((e as Error).message, true);
      return false;
    } finally {
      setBusy('');
    }
  }
  const send = (url: string, method: string, body: unknown) =>
    api(url, { method, body: JSON.stringify(body) });

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    if (pw.password !== pw.again) return toast('كلمتا المرور الجديدتان غير متطابقتين.', true);
    const ok = await run(
      'pw',
      () => send('/profile/password', 'PUT', { current: pw.current, password: pw.password }),
      'تم تغيير كلمة المرور وإنهاء الجلسات الأخرى.',
    );
    if (ok) setPw({ current: '', password: '', again: '' });
  }
  async function chooseAvatar(file: File | undefined) {
    if (!file) return;
    setBusy('avatar');
    try {
      const prepared = await prepareAvatar(file);
      const form = new FormData();
      form.set('file', prepared);
      await api('/profile/avatar', { method: 'POST', body: form });
      toast('تم تحديث صورتك الشخصية.');
      await refresh();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy('');
      if (fileRef.current) fileRef.current.value = '';
    }
  }
  async function savePhone(e: FormEvent) {
    e.preventDefault();
    const ok = await run(
      'phone',
      () => send('/profile/phone', 'PUT', { phone: phone ?? profile.phone ?? '' }),
      'تم حفظ رقم الموبايل.',
    );
    if (ok) setPhone(null);
  }
  async function changeEmail(e: FormEvent) {
    e.preventDefault();
    const ok = await run(
      'email',
      () => send('/profile/email', 'PUT', mail),
      'تم تغيير البريد الإلكتروني.',
    );
    if (ok) setMail({ email: '', password: '' });
  }
  async function addUniversityId(e: FormEvent) {
    e.preventDefault();
    const ok = await run(
      'uid',
      () => send('/profile/university-id', 'PUT', { studentId: uid }),
      'تم حفظ الرقم الجامعي.',
    );
    if (ok) setUid('');
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">حسابك</span>
          <h1>ملفي الشخصي</h1>
          <p>بيانات حسابك، وأمانه، وسجل مشاركاتك ودرجاتك.</p>
        </div>
      </div>

      <EmailVerifyBanner />
      <section className="card profile-hero">
        <div className="profile-photo">
          <Avatar
            userId={session.user?.id}
            version={session.user?.avatar_v}
            name={profile.name}
            className="profile-avatar"
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg"
            hidden
            aria-label="اختر صورة شخصية"
            onChange={(e) => chooseAvatar(e.target.files?.[0])}
          />
          <div className="profile-photo-actions">
            <button
              type="button"
              className="link-button"
              disabled={busy === 'avatar'}
              onClick={() => fileRef.current?.click()}
            >
              <Camera size={14} aria-hidden="true" />{' '}
              {session.user?.avatar_v ? 'تغيير الصورة' : 'إضافة صورة (اختياري)'}
            </button>
            {Boolean(session.user?.avatar_v) && (
              <button
                type="button"
                className="link-button"
                disabled={busy === 'avatar'}
                onClick={() =>
                  run(
                    'avatar',
                    () => api('/profile/avatar', { method: 'DELETE', body: '{}' }),
                    'تمت إزالة الصورة.',
                  )
                }
              >
                إزالة
              </button>
            )}
          </div>
        </div>
        <div className="profile-id">
          <h2>{profile.name}</h2>
          <p>
            {session.faculty.faculty} · {session.faculty.university}
          </p>
          <div className="profile-chips">
            {profile.year && (
              <span>
                <GraduationCap size={15} aria-hidden="true" /> {profile.year}
              </span>
            )}
            {profile.idShown && (
              <span dir="auto">
                <BadgeCheck size={15} aria-hidden="true" /> {profile.idShown}
              </span>
            )}
          </div>
        </div>
        <div className="profile-score" aria-label={`الدرجات ${totalPoints} من ${max}`}>
          <span>الدرجات</span>
          <strong>
            {number(Math.min(totalPoints, max))} / {number(max)}
          </strong>
        </div>
      </section>

      <MissionCard request={mine.data?.request} force />

      <div className="profile-grid">
        <section className="card profile-card">
          <h3>بيانات الحساب</h3>
          <dl className="profile-list">
            <div>
              <dt>الاسم</dt>
              <dd>{profile.name}</dd>
            </div>
            <div>
              <dt>
                <Mail size={14} aria-hidden="true" /> البريد الإلكتروني
              </dt>
              <dd>
                <bdi dir="ltr">{profile.email}</bdi>
                {session.emailEnabled && (
                  <span className={`mail-state ${session.user?.email_verified ? 'is-ok' : ''}`}>
                    {session.user?.email_verified ? 'مؤكد' : 'غير مؤكد'}
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt>الرقم الجامعي / القومي</dt>
              <dd dir="auto">{profile.idShown || '—'}</dd>
            </div>
            <div>
              <dt>تاريخ إنشاء الحساب</dt>
              <dd>{date(profile.createdAt)}</dd>
            </div>
            <div>
              <dt>الموافقة على الشروط</dt>
              <dd>
                {profile.termsAcceptedAt ? date(profile.termsAcceptedAt) : '—'}{' '}
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setTermsOpen(!termsOpen)}
                >
                  <ScrollText size={14} aria-hidden="true" /> {termsOpen ? 'إخفاء' : 'عرض الشروط'}
                </button>
              </dd>
            </div>
          </dl>
          {termsOpen && (
            <ol className="profile-terms">
              {TERMS.map((t) => (
                <li key={t.title}>
                  <strong>{t.title}</strong> {t.text}
                </li>
              ))}
            </ol>
          )}
          <form className="profile-inline" onSubmit={savePhone}>
            <label>
              رقم الموبايل (اختياري)
              <input
                type="tel"
                inputMode="tel"
                dir="ltr"
                maxLength={20}
                placeholder="01xxxxxxxxx"
                value={phone ?? profile.phone ?? ''}
                onChange={(e) => setPhone(e.target.value)}
              />
              <small className="field-hint">
                يراه الموظف المختص فقط، للتواصل بشأن طلبك. اتركه فارغًا لحذفه.
              </small>
            </label>
            <button className="button secondary" disabled={busy === 'phone' || phone === null}>
              حفظ الرقم
            </button>
          </form>
          <label className="profile-year">
            الفرقة الدراسية
            <select
              value={profile.year ?? ''}
              disabled={busy === 'year'}
              onChange={(e) =>
                run(
                  'year',
                  () => send('/profile/year', 'PUT', { year: e.target.value }),
                  'تم تحديث الفرقة.',
                )
              }
            >
              {YEARS.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
            <small className="field-hint">حدّثها كل عام دراسي.</small>
          </label>
          {!profile.hasUniversityId && (
            <form className="profile-inline" onSubmit={addUniversityId}>
              <label>
                أضف رقمك الجامعي (على الكارنيه)
                <input
                  value={uid}
                  onChange={(e) => setUid(e.target.value)}
                  inputMode="numeric"
                  dir="ltr"
                  placeholder="مثال: 20260001"
                  maxLength={20}
                />
                <small className="field-hint">
                  سجّلت برقمك القومي. بعد إضافة الرقم الجامعي يُستخدم هو في الاستمارة بدل القومي،
                  ولا يمكن تغييره بعد ذلك من هنا.
                </small>
              </label>
              <button
                className="button secondary"
                disabled={busy === 'uid' || uid.trim().length < 4}
              >
                حفظ الرقم الجامعي
              </button>
            </form>
          )}
          <p className="muted small-text">
            الاسم والبريد والأرقام الرسمية للعرض فقط. لتصحيح أي خطأ فيها تواصل مع{' '}
            {session.faculty.office}.
          </p>
        </section>

        <section className="card profile-card">
          <h3>
            <KeyRound size={18} aria-hidden="true" /> الأمان
          </h3>
          <form className="profile-form" onSubmit={changePassword}>
            <label>
              كلمة المرور الحالية
              <input
                type="password"
                autoComplete="current-password"
                value={pw.current}
                onChange={(e) => setPw({ ...pw, current: e.target.value })}
                required
              />
            </label>
            <label>
              كلمة المرور الجديدة
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={100}
                value={pw.password}
                onChange={(e) => setPw({ ...pw, password: e.target.value })}
                required
              />
              <small className="field-hint">٨ أحرف على الأقل.</small>
            </label>
            <label>
              أعد كتابة كلمة المرور الجديدة
              <input
                type="password"
                autoComplete="new-password"
                value={pw.again}
                onChange={(e) => setPw({ ...pw, again: e.target.value })}
                required
              />
            </label>
            <button className="button" disabled={busy === 'pw'}>
              {busy === 'pw' ? 'جارٍ الحفظ…' : 'تغيير كلمة المرور'}
            </button>
          </form>
          {session.emailEnabled && (
            <label className="profile-toggle">
              <input
                type="checkbox"
                checked={Boolean(session.user?.email_notifications)}
                disabled={!session.user?.email_verified || busy === 'mailpref'}
                onChange={(e) =>
                  run(
                    'mailpref',
                    () =>
                      send('/profile/email-notifications', 'PUT', { enabled: e.target.checked }),
                    e.target.checked ? 'سنرسل الإشعارات إلى بريدك.' : 'تم إيقاف رسائل البريد.',
                  )
                }
              />
              <span>
                أرسل لي إشعارًا على بريدي الإلكتروني
                <small className="field-hint">
                  {session.user?.email_verified
                    ? 'رسالة عامة تنبهك بوجود جديد، بدون تفاصيل طلبك.'
                    : 'أكّد بريدك أولًا لتفعيل هذا الخيار.'}
                </small>
              </span>
            </label>
          )}
          <h3 className="profile-sub">تغيير البريد الإلكتروني</h3>
          <form className="profile-form" onSubmit={changeEmail}>
            <label>
              البريد الجديد
              <input
                type="email"
                dir="ltr"
                autoComplete="email"
                maxLength={160}
                value={mail.email}
                onChange={(e) => setMail({ ...mail, email: e.target.value })}
                required
              />
            </label>
            <label>
              كلمة المرور الحالية للتأكيد
              <input
                type="password"
                autoComplete="current-password"
                value={mail.password}
                onChange={(e) => setMail({ ...mail, password: e.target.value })}
                required
              />
            </label>
            <button className="button secondary" disabled={busy === 'email'}>
              تغيير البريد
            </button>
          </form>
          <button
            type="button"
            className="button secondary profile-others"
            disabled={busy === 'others'}
            onClick={() =>
              run(
                'others',
                () => send('/profile/logout-others', 'POST', {}),
                'تم تسجيل الخروج من الأجهزة الأخرى.',
              )
            }
          >
            <LogOut size={16} aria-hidden="true" /> تسجيل الخروج من الأجهزة الأخرى
          </button>
        </section>
      </div>

      <section className="card profile-card profile-history">
        <h3>سجل مشاركاتي</h3>
        {history.length === 0 ? (
          <Empty
            icon={<ClipboardCheck size={26} />}
            title="لا توجد مشاركات مرسلة بعد"
            text="بعد إرسال نشاطك تظهر هنا حالته ودرجته."
            action={
              <Link to="/activity" className="button">
                سجّل نشاطك
              </Link>
            }
          />
        ) : (
          <ul>
            {history.map((h) => (
              <li key={h.id}>
                <div>
                  <strong>{h.title}</strong>
                  <small>
                    {h.period} · {date(h.submitted_at)}
                  </small>
                </div>
                <Badge status={h.status} />
                <span className="profile-points">
                  {number(h.points)} / {number(max)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
