import { useState, useEffect, type FormEvent } from 'react';
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
} from 'lucide-react';
import {
  api,
  ErrorPanel,
  Loading,
  SessionContext,
  setCsrf,
  ToastProvider,
  useSession,
  useToast,
} from './lib';
import type { Role, Session } from './types';
import { StudentDashboard, ActivityPage, DocumentsPage } from './Student';
import { StaffDashboard, RequestList, ReviewPage, StaffPage } from './Staff';

function Mark({ light = false }: { light?: boolean }) {
  return (
    <div className={`brand ${light ? 'light' : ''}`}>
      <span className="brand-mark">
        <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <path
            d="M10 28V16h6v12m8 0V11h6v17M8 32h24"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx="13" cy="10" r="2.5" fill="currentColor" />
        </svg>
      </span>
      <div>
        <strong>
          أثَر<span className="brand-dot">.</span>
        </strong>
        <small>بوابة النشاط الطلابي</small>
      </div>
    </div>
  );
}
function Login({ session, refresh }: { session: Session; refresh: () => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [role, setRole] = useState<Role>('student');
  const [accounts, setAccounts] = useState<{ role: Role; email: string; password: string }[]>([]);
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
    setBusy(true);
    setError('');
    try {
      await api('/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <section className="login-story">
        <Mark light />
        <div className="login-story-body">
          <span className="eyebrow light">
            <span />
            خطوة صغيرة. أثر يستمر.
          </span>
          <h1>
            مشاركتك تصنع
            <br />
            <span>فرقًا.</span>
          </h1>
          <p>
            مساحتك لتوثيق نشاطك، ومتابعة رحلتك
            <br className="desktop-only" /> من أول مشاركة إلى الاعتماد.
          </p>
          <div className="campus-art" aria-hidden="true">
            <div className="art-orbit one" />
            <div className="art-orbit two" />
            <div className="art-star">
              <Sparkles size={28} />
            </div>
            <svg viewBox="0 0 440 220">
              <path
                d="M55 190h330M87 185V89h266v96M74 84l146-65 146 65H74Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M110 100v74m45-74v74m44-74v74m44-74v74m44-74v74m44-74v74M96 103h248M96 174h248M80 196h280M69 207h302"
                stroke="currentColor"
                strokeWidth="6"
              />
              <circle cx="220" cy="59" r="14" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
            <span className="art-tag">
              <Leaf size={16} /> لكل مشاركة قيمة
            </span>
          </div>
        </div>
        <div className="login-story-footer">
          <span>{session.faculty.faculty}</span>
          <span>
            نحو تجربة جامعية أكثر أثرًا <ArrowUpLeft size={14} />
          </span>
        </div>
      </section>
      <section className="login-form-side">
        <div className="login-top">
          <span>{session.faculty.faculty}</span>
          <span className="period-tag">{session.faculty.period}</span>
        </div>
        <div className="login-form-wrap">
          <span className="section-kicker">أهلًا بعودتك</span>
          <h2>ابدأ رحلتك من هنا</h2>
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
          <form onSubmit={submit}>
            <label>
              البريد الإلكتروني
              <input
                dir="ltr"
                type="email"
                required
                autoComplete="username"
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="أدخل كلمة المرور"
              />
            </label>
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
          <div className="login-security">
            <ShieldCheck size={17} />
            <p>الدخول الرسمي للطلاب يُفعّل بعد اعتماد آلية التحقق والربط مع الجامعة.</p>
          </div>
          {session.demo && (
            <p className="demo-disclaimer">
              بيئة تجريبية ببيانات وهمية. لا تستخدم بيانات أو مستندات شخصية حقيقية.
            </p>
          )}
        </div>
        <footer className="login-copyright">أثَر — كل مشاركة تستحق أن تُروى.</footer>
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
  useEffect(() => {
    setOpen(false);
    setAccountOpen(false);
  }, [location.pathname]);
  const isStudent = user.role === 'student';
  const nav = isStudent
    ? [
        { path: '/', label: 'الرئيسية', icon: LayoutDashboard },
        { path: '/activity', label: 'نشاطي', icon: Leaf },
        { path: '/documents', label: 'المستندات والاستمارة', icon: FileText },
      ]
    : [
        { path: '/', label: 'نظرة عامة', icon: LayoutDashboard },
        { path: '/requests', label: 'طلبات الأنشطة', icon: ClipboardCheck },
        ...(user.role === 'admin'
          ? [{ path: '/staff', label: 'إدارة الموظفين', icon: Users }]
          : []),
      ];
  const title =
    location.pathname === '/'
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
      await refresh();
      navigate('/');
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  return (
    <div className="app-shell">
      {open && (
        <button
          className="sidebar-scrim"
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
            <strong>{session.faculty.faculty}</strong>
            <small>{session.faculty.period}</small>
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
              <Leaf size={19} />
            </span>
            <h4>كل نشاط، بداية أثر.</h4>
            <p>
              وثّق مشاركتك وخلّي إنجازك
              <br />
              جزءًا من رحلتك الجامعية.
            </p>
          </div>
          <div className="sidebar-user">
            <span className="avatar">{user.name[0]}</span>
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
            <Link
              className="icon-button notification"
              to={isStudent ? '/activity' : '/requests?status=pending'}
              aria-label="متابعة الطلبات"
            >
              <Bell size={19} />
            </Link>
            <span className="topbar-divider" />
            <div className="account-wrap">
              <button
                className="account-button"
                onClick={() => setAccountOpen(!accountOpen)}
                aria-expanded={accountOpen}
              >
                <span className="avatar small">{user.name[0]}</span>
                <span>{user.name.split(' ')[0]}</span>
                <ChevronLeft size={14} />
              </button>
              {accountOpen && (
                <div className="account-menu">
                  <strong>{user.name}</strong>
                  <small dir="ltr">{user.email}</small>
                  <button onClick={logout}>
                    <LogOut size={16} />
                    تسجيل الخروج
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        {session.demo && (
          <div className="demo-bar">
            <span>
              <span className="demo-dot" />
              نسخة تجريبية
            </span>
            <p>بيانات للعرض والاختبار فقط — الربط الرسمي بالجامعة غير مفعّل.</p>
          </div>
        )}
        <main className="main-content" id="main-content">
          <Routes>
            <Route path="/" element={isStudent ? <StudentDashboard /> : <StaffDashboard />} />
            {isStudent ? (
              <>
                <Route path="/activity" element={<ActivityPage />} />
                <Route path="/documents" element={<DocumentsPage />} />
              </>
            ) : (
              <>
                <Route path="/requests" element={<RequestList />} />
                <Route path="/requests/:id" element={<ReviewPage />} />
                {user.role === 'admin' && <Route path="/staff" element={<StaffPage />} />}
              </>
            )}
            <Route path="/guide" element={<Guide />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <footer className="page-footer">
            <span>
              أثَر <span>—</span> بوابة النشاط الطلابي
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
      'تقديم الأنشطة، والمرفقات، والاستمارة، والمراجعة والاعتماد، وإدارة الموظفين متاحة للاختبار. الدخول بحساب الجامعة وGoogle والمساعد الذكي والربط المركزي تحتاج إعدادًا وتكاملًا رسميًا؛ ليست مفعلة حاليًا.',
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
        <a href="#main-content" className="skip-link">
          انتقل إلى المحتوى
        </a>
        {session.user ? <Shell /> : <Login session={session} refresh={refresh} />}
      </SessionContext.Provider>
    </ToastProvider>
  );
}
