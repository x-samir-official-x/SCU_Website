import { useState, useEffect, useRef, type FormEvent } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpLeft,
  Bell,
  BookOpen,
  Check,
  ChevronLeft,
  ClipboardCheck,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Leaf,
  LogOut,
  Menu,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  UserRound,
} from 'lucide-react';
import {
  api,
  ErrorPanel,
  logoSrc,
  Loading,
  SessionContext,
  setCsrf,
  ToastProvider,
  useSession,
  usePresence,
  useToast,
} from './lib';
import type { Role, Session } from './types';
import { StudentDashboard, ActivityPage, DocumentsPage } from './Student';
import { ProfilePage } from './Profile';
import { VerifyEmailPage } from './VerifyEmail';
import { ForgotPasswordPage, ResetPasswordPage } from './ForgotPassword';
import { Avatar } from './Avatar';
import { NotificationBell } from './NotificationBell';
import { StaffDashboard, RequestList, ReviewPage, StaffPage } from './Staff';

import { BrandMark as Mark, AcademicSeal, LoginProcess } from './Brand';
import { Landing, Register, ActivityGallery } from './Landing';

function Login({ session, refresh }: { session: Session; refresh: () => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [role, setRole] = useState<Role>('student');
  const [accounts, setAccounts] = useState<{ role: Role; email: string; password: string }[]>([]);
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (session.demo)
      api('/demo-accounts')
        .then((r) => setAccounts(r.accounts))
        .catch(() => {});
  }, [session.demo]);
  const choose = (value: Role) => {
    setRole(value);
    const account = accounts.find((a) => a.role === value);
    if (account) {
      setEmail(account.email);
      setPassword(account.password);
    }
    setError('');
  };
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!email.trim()) return setError('اكتب بريدك الإلكتروني.');
    if (!password) return setError('اكتب كلمة المرور.');
    setBusy(true);
    try {
      await api('/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      await refresh();
      navigate(location.state?.from === '/community' ? '/community' : '/dashboard');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page" id="main-content" tabIndex={-1}>
      <section className="login-story">
        <Mark light />
        <div className="login-story-body">
          <span className="login-wordmark" lang="ar">
            {session.faculty.platformName}
          </span>
          <span className="login-institution-label">جامعة قناة السويس</span>
          <h1>
            بوابة النشاط <br />
            الطلابي
          </h1>
          <p>
            خدمات النشاط الطلابي بكلية التجارة.
            <br />
            من تسجيل المشاركة إلى مراجعتها واعتمادها، في مكان واحد.
          </p>
          <LoginProcess />
        </div>
        <div className="login-story-footer">
          <span>كلية التجارة</span>
          <span>تسجيل · متابعة · اعتماد</span>
        </div>
      </section>
      <section className="login-form-side">
        <div className="login-top">
          <span>{session.faculty.faculty}</span>
          <span className="period-tag">{session.faculty.period}</span>
        </div>
        <div className="login-form-wrap">
          <Link className="lp-login-back" to="/welcome">
            <ArrowLeft size={16} />
            العودة إلى الصفحة الرئيسية
          </Link>
          <span className="section-kicker">أهلًا بعودتك</span>
          <h2>تسجيل الدخول</h2>
          <p className="muted">سجّل دخولك للوصول إلى حسابك ومتابعة نشاطك.</p>
          {session.demo && (
            <div className="demo-login">
              <span>
                <Sparkles size={15} />
                جرّب المنظومة بحساب تجريبي
              </span>
              <div className="role-tabs">
                {(['student', 'moderator', 'admin'] as Role[]).map((r) => (
                  <button
                    type="button"
                    className={role === r ? 'active' : ''}
                    onClick={() => choose(r)}
                    key={r}
                  >
                    {r === 'student' ? 'طالب' : r === 'moderator' ? 'موظف' : 'مسؤول رئيسي'}
                  </button>
                ))}
              </div>
              <button className="text-button" onClick={() => choose(role)}>
                تعبئة بيانات الحساب التجريبي <ChevronLeft size={14} />
              </button>
            </div>
          )}
          <form onSubmit={submit} noValidate>
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
            <label>
              كلمة المرور
              <input
                dir="ltr"
                type="password"
                required
                autoComplete="current-password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="أدخل كلمة المرور"
              />
            </label>
            {session.emailEnabled && (
              <Link className="forgot-link" to="/forgot-password">
                نسيت كلمة المرور؟
              </Link>
            )}
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <button className="button primary full" disabled={busy}>
              {busy ? 'جارٍ تسجيل الدخول…' : 'تسجيل الدخول'}
              <ArrowLeft size={18} />
            </button>
          </form>
          <p className="lp-login-register">
            أول مرة تزورنا؟ <Link to="/register">إنشاء حساب جديد</Link>
          </p>
          <div className="login-security">
            <ShieldCheck size={17} />
            <p>الدخول الرسمي للطلاب يُفعّل بعد اعتماد آلية التحقق والربط مع الجامعة.</p>
          </div>
          {session.demo && (
            <p className="demo-disclaimer">
              {session.preview
                ? 'معاينة تفاعلية ببيانات محلية في متصفحك. لا تستخدم كلمات مرور أو مستندات شخصية حقيقية.'
                : 'بيئة تجريبية ببيانات وهمية. لا تستخدم بيانات أو مستندات شخصية حقيقية.'}
            </p>
          )}
        </div>
        <footer className="login-copyright">كلية التجارة — جامعة قناة السويس</footer>
      </section>
    </div>
  );
}
function Shell() {
  const { session, refresh } = useSession();
  const user = session.user!;
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const accountRef = useRef<HTMLDivElement>(null);
  const scrim = usePresence(open);
  const accountMenu = usePresence(accountOpen, 150);
  useEffect(() => {
    setOpen(false);
    setAccountOpen(false);
    document.getElementById('main-content')?.focus({ preventScroll: true });
  }, [location.pathname]);
  useEffect(() => {
    if (!accountOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!accountRef.current?.contains(e.target as Node)) setAccountOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAccountOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [accountOpen]);
  const isStudent = user.role === 'student';
  const nav = isStudent
    ? [
        { path: '/dashboard', label: 'الرئيسية', icon: LayoutDashboard },
        { path: '/activity', label: 'نشاطي', icon: ClipboardCheck },
        { path: '/documents', label: 'المستندات والاستمارة', icon: FileText },
        { path: '/community', label: 'أنشطة الطلاب', icon: Users },
        { path: '/profile', label: 'ملفي الشخصي', icon: UserRound },
        { path: '/welcome', label: 'واجهة البوابة', icon: GraduationCap },
      ]
    : [
        { path: '/dashboard', label: 'نظرة عامة', icon: LayoutDashboard },
        { path: '/requests', label: 'طلبات الأنشطة', icon: ClipboardCheck },
        ...(user.role === 'admin'
          ? [{ path: '/staff', label: 'إدارة الموظفين', icon: Users }]
          : []),
      ];
  const title =
    location.pathname === '/dashboard'
      ? isStudent
        ? 'لوحة الطالب'
        : 'لوحة الإدارة'
      : location.pathname.startsWith('/requests/')
        ? 'مراجعة الطلب'
        : [...nav, { path: '/guide', label: 'الدليل والإرشادات' }].find(
            (n) => n.path === location.pathname,
          )?.label || 'بوابة النشاط';
  async function logout() {
    try {
      await api('/logout', { method: 'POST', body: '{}' });
      navigate('/');
      await refresh();
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  return (
    <div className="app-shell">
      {scrim.render && (
        <button
          className="sidebar-scrim"
          data-state={scrim.state}
          onClick={() => setOpen(false)}
          aria-label="إغلاق القائمة"
        />
      )}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <Mark />
          <button
            className="icon-button mobile-only"
            onClick={() => setOpen(false)}
            aria-label="إغلاق القائمة"
          >
            <X />
          </button>
        </div>
        <div className="faculty-chip">
          <GraduationCap size={20} />
          <div>
            <strong lang="ar">{session.faculty.platformName || session.faculty.faculty}</strong>
            <small>
              {session.faculty.brand} · {session.faculty.period}
            </small>
          </div>
        </div>
        <span className="nav-label">مساحتك</span>
        <nav>
          {nav.map((n) => (
            <NavLink
              to={n.path}
              end={n.path === '/'}
              key={n.path}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <n.icon size={20} />
              <span>{n.label}</span>
              <ChevronLeft className="nav-chevron" size={15} />
            </NavLink>
          ))}
          <NavLink className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} to="/guide">
            <BookOpen size={20} />
            <span>الدليل والإرشادات</span>
            <ChevronLeft className="nav-chevron" size={15} />
          </NavLink>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="tiny-leaf">
              <BookOpen size={19} aria-hidden="true" />
            </span>
            <h4>خدمات النشاط الطلابي</h4>
            <p>
              سجّل نشاطك وتابع طلبك
              <br />
              حتى اكتمال الاعتماد.
            </p>
          </div>
          <div className="sidebar-user">
            <Avatar userId={user.id} version={user.avatar_v} name={user.name} />
            <div>
              <strong>{user.name}</strong>
              <small>
                {isStudent
                  ? `رقم الطالب ${user.student_id}`
                  : user.role === 'admin'
                    ? 'المسؤول الرئيسي'
                    : 'موظف مراجعة الأنشطة'}
              </small>
            </div>
            <button
              className="icon-button"
              title="تسجيل الخروج"
              aria-label="تسجيل الخروج"
              onClick={logout}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-only"
              onClick={() => setOpen(true)}
              aria-label="فتح القائمة"
            >
              <Menu />
            </button>
            <span>{session.faculty.faculty}</span>
            <ChevronLeft size={14} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-actions">
            <NotificationBell />
            <span className="topbar-divider" />
            <div className="account-wrap" ref={accountRef}>
              <button
                className="account-button"
                onClick={() => setAccountOpen(!accountOpen)}
                aria-expanded={accountOpen}
              >
                <Avatar
                  userId={user.id}
                  version={user.avatar_v}
                  name={user.name}
                  className="small"
                />
                <span>{user.name.split(' ')[0]}</span>
                <ChevronLeft size={14} />
              </button>
              {accountMenu.render && (
                <div className="account-menu" data-state={accountMenu.state}>
                  <strong>{user.name}</strong>
                  <small dir="ltr">{user.email}</small>
                  {isStudent && (
                    <Link to="/profile" onClick={() => setAccountOpen(false)}>
                      <UserRound size={16} />
                      ملفي الشخصي
                    </Link>
                  )}
                  <button onClick={logout}>
                    <LogOut size={16} />
                    تسجيل الخروج
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <div className="mobile-institution">
          <div>
            <strong>{session.faculty.university}</strong>
            <span>{session.faculty.faculty}</span>
          </div>
          <img
            src={logoSrc(session.faculty.logoPath)}
            width="2001"
            height="786"
            alt="شعار الجامعة والكلية"
          />
        </div>
        {session.demo && (
          <div className="demo-bar">
            <span>
              <span className="demo-dot" />
              {session.preview ? 'معاينة تفاعلية' : 'نسخة تجريبية'}
            </span>
            <p>
              {session.preview
                ? 'البيانات محفوظة في هذا المتصفح فقط؛ ليست مشتركة بين الأجهزة ولا تصلح للاستخدام الرسمي.'
                : 'بيانات للعرض والاختبار فقط — الربط الرسمي بالجامعة غير مفعّل.'}
            </p>
          </div>
        )}
        <main className="main-content" id="main-content" tabIndex={-1}>
          <div className="route-surface" key={location.pathname}>
            <Routes>
              <Route
                path="/dashboard"
                element={isStudent ? <StudentDashboard /> : <StaffDashboard />}
              />
              {isStudent ? (
                <>
                  <Route path="/activity" element={<ActivityPage />} />
                  <Route path="/documents" element={<DocumentsPage />} />
                  <Route path="/profile" element={<ProfilePage />} />
                </>
              ) : (
                <>
                  <Route path="/requests" element={<RequestList />} />
                  <Route path="/requests/:id" element={<ReviewPage />} />
                  {user.role === 'admin' && <Route path="/staff" element={<StaffPage />} />}
                </>
              )}
              <Route path="/guide" element={<Guide />} />
              <Route
                path="/community"
                element={
                  <>
                    <div className="page-heading">
                      <div>
                        <span className="section-kicker">مجتمع كلية التجارة</span>
                        <h1>أنشطة الطلاب</h1>
                        <p>
                          مشاركات الطلاب المنشورة بموافقتهم وبدون أسمائهم، وتُكمَّل بنماذج توضيحية
                          حتى تتوفر مشاركات كافية.
                        </p>
                      </div>
                    </div>
                    <ActivityGallery full />
                  </>
                }
              />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </div>
          <footer className="page-footer">
            <span>
              جامعة قناة السويس <span>—</span> بوابة النشاط الطلابي
            </span>
            <span>
              {session.faculty.faculty} · {session.faculty.period}
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function Guide() {
  const { session } = useSession();
  const items = [
    [
      'الدخول والتحقق من الهوية',
      'حسابك مرتبط ببيانات الطالب. لا تشارك كلمة المرور مع أي شخص، وراجع الجهة المختصة عند وجود خطأ في بياناتك الرسمية.',
    ],
    [
      'بيانات النشاط والمرفقات',
      'اكتب اسم النشاط والجهة المنظمة وتاريخ المشاركة ووصفًا واضحًا لدورك. أرفق مستندًا مؤيدًا واحدًا على الأقل، بحد أقصى ٥ ملفات. الصيغ المتاحة PDF وJPG وPNG، حتى ٨ ميجابايت للملف.',
    ],
    [
      'الاستمارة والتسليم',
      `بعد إرسال الطلب، نزّل الاستمارة واطبعها وقدمها للمكتب المختص. ${session.faculty.office}. الاستمارة ليست إثباتًا للاعتماد.`,
    ],
    [
      'الاعتماد والدرجات',
      'يُحتسب نشاط واحد بـ٤٠ درجة كاملة بعد مراجعة الموظف للورق واعتماده. الطلبات المعلقة أو التي تتطلب استكمالًا لا تُحتسب لها درجات.',
    ],
    [
      'التعديل والإلغاء',
      'يمكن تعديل المسودة أو الطلب المعاد للاستكمال. بعد التقديم تتوقف إمكانية التعديل حتى يقرر الموظف إعادته. جميع قرارات المراجعة موثقة داخل الطلب.',
    ],
    [
      'ما المتاح في النسخة الحالية؟',
      'تقديم الأنشطة، والمرفقات، والاستمارة، والمراجعة والاعتماد، وإدارة الموظفين متاحة للاختبار. ومعها مساعد الكتابة المحلي والمعرض العام الاختياري وملفك الشخصي. الدخول بحساب الجامعة وGoogle والربط المركزي تحتاج إعدادًا وتكاملًا رسميًا؛ ليست مفعلة حاليًا.',
    ],
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">كل ما تحتاج معرفته</span>
          <h1>الدليل والإرشادات</h1>
          <p>خطوات واضحة لتجربة أبسط، من التقديم إلى الاعتماد.</p>
        </div>
        <div className="heading-emblem">
          <BookOpen />
        </div>
      </div>
      <div className="guide-grid">
        {items.map(([title, content], i) => (
          <article className="card guide-card" key={title}>
            <span className="guide-number">{String(i + 1).padStart(2, '0')}</span>
            <h3>{title}</h3>
            <p>{content}</p>
          </article>
        ))}
      </div>
      <div className="info-box">
        <ShieldCheck size={22} />
        <p>
          النماذج والأنشطة الظاهرة في النسخة التجريبية ليست لائحة رسمية. تُعتمد شروط الاستحقاق
          ونموذج الاستمارة والفترة الدراسية قبل التشغيل الفعلي.
        </p>
      </div>
    </>
  );
}
function RouteProgress() {
  const { pathname } = useLocation();
  const first = useRef(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setTick((t) => t + 1);
  }, [pathname]);
  return tick ? <div className="route-progress" key={tick} aria-hidden="true" /> : null;
}
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname, hash]);
  return null;
}
export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState('');
  async function refresh() {
    try {
      const data = await api<Session>('/session');
      setCsrf(data.csrfToken || '');
      setSession(data);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    refresh();
  }, []);
  if (error) return <ErrorPanel message={error} retry={refresh} />;
  if (!session) return <Loading />;
  return (
    <ToastProvider>
      <SessionContext.Provider value={{ session, refresh }}>
        <ScrollToTop />
        <RouteProgress />
        <a href="#main-content" className="skip-link">
          انتقل إلى المحتوى
        </a>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/welcome" element={<Landing />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="/login"
            element={
              session.user ? (
                <Navigate to="/dashboard" replace />
              ) : (
                <Login session={session} refresh={refresh} />
              )
            }
          />
          <Route
            path="/register"
            element={session.user ? <Navigate to="/dashboard" replace /> : <Register />}
          />
          <Route path="/*" element={session.user ? <Shell /> : <Navigate to="/login" replace />} />
        </Routes>
      </SessionContext.Provider>
    </ToastProvider>
  );
}
