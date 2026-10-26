import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { flushSync } from 'react-dom';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUpLeft,
  Check,
  ChevronDown,
  FileText,
  Leaf,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { api, useSession } from './lib';
import './landing.css';
import { LandingNav } from './LandingNav';

const posts = [
  {
    id: 'green',
    category: 'عمل تطوعي',
    title: 'مساحة خضراء… بأيدينا',
    text: 'شاركنا في زراعة شتلات جديدة وتجهيز مساحات خضراء داخل الحرم. تجربة بسيطة علمتنا قيمة العمل معًا، وأن كل مشاركة تترك أثرًا.',
    image: '/photos/volunteer.webp',
    alt: 'صورة مولّدة توضيحية لطلاب يتعاونون في زراعة شجرة',
    author: 'فريق المبادرات الطلابية',
    kind: 'photo',
  },
  {
    id: 'finance',
    category: 'مبادرة طلابية',
    title: 'معرفة مالية لحياة أفضل',
    text: 'ورشة تفاعلية للتعريف بأساسيات الادخار وإدارة المصروفات، وتحويل ما نتعلمه في المحاضرات إلى معرفة نشاركها مع الآخرين.',
    image: '/photos/finance.svg',
    alt: 'رسم توضيحي لورشة التوعية المالية',
    author: 'فريق التوعية المالية',
    kind: 'illustration',
  },
  {
    id: 'community',
    category: 'خدمة مجتمعية',
    title: 'معًا، نصل إلى أكثر',
    text: 'من تجهيز الأدوات إلى تنظيم المشاركة، لكل فرد دور في نجاح اليوم التطوعي. يوم مليء بالتعاون والمواقف التي تستحق أن نحكيها.',
    image: '/photos/community.svg',
    alt: 'رسم توضيحي لأيدي متعاونة في نشاط مجتمعي',
    author: 'فريق العمل التطوعي',
    kind: 'illustration',
  },
];
const faqs = [
  [
    'هل أسجّل أكثر من نشاط للحصول على الدرجة؟',
    'المطلوب نشاط واحد فقط. تُحتسب له ٤٠ درجة كاملة بعد تسليم الاستمارة الورقية ومراجعتها واعتمادها بواسطة الموظف المختص.',
  ],
  [
    'هل رفع النشاط يعني اعتماده؟',
    'بعد التقديم يظهر نشاطك قيد المراجعة. نزّل الاستمارة واطبعها وسلّمها للمكتب المختص. يراجع الموظف بياناتك على النظام ثم يعتمد النشاط، وعندها تتحدث حالته في حسابك.',
  ],
  [
    'أين أسلّم الاستمارة؟',
    'سيُعلن مكتب التسليم ومواعيده المعتمدة قبل التشغيل الرسمي. ستظهر التعليمات داخل حسابك مع الاستمارة.',
  ],
  [
    'هل تظهر بياناتي ومستنداتي للزوار؟',
    'المرفقات والبيانات الشخصية داخل طلبك ليست منشورات عامة. المعرض الحالي يعرض نماذج توضيحية فقط؛ إتاحة مشاركات حقيقية تحتاج موافقة صاحبها ومراجعة المحتوى قبل النشر.',
  ],
];

export function ActivityGallery({ full = false }: { full?: boolean }) {
  const [filter, setFilter] = useState('الكل');
  const [selected, setSelected] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const active = posts.find((p) => p.id === selected);
  const navigate = useNavigate();
  const { session } = useSession();
  function chooseFilter(value: string, keyboard: boolean) {
    if (value === filter) return;
    if (
      !keyboard &&
      document.startViewTransition &&
      !matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      const transition = document.startViewTransition(() => flushSync(() => setFilter(value)));
      // A rapid second selection may supersede a snapshot transition.
      transition.finished.catch(() => {});
    } else setFilter(value);
  }
  function open(id: string) {
    if (!session.user) {
      navigate('/login', { state: { from: '/community' } });
      return;
    }
    setSelected(id);
    dialog.current?.showModal();
  }
  return (
    <>
      <div className="activity-filters" aria-label="تصفية نماذج الأنشطة">
        {['الكل', 'عمل تطوعي', 'مبادرة طلابية', 'خدمة مجتمعية'].map((item) => (
          <button
            key={item}
            aria-pressed={filter === item}
            onClick={(event) => chooseFilter(item, event.detail === 0)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="activity-showcase">
        {posts
          .filter((p) => filter === 'الكل' || p.category === filter)
          .map((post) => (
            <article
              className="public-post"
              key={post.id}
              style={{ viewTransitionName: `lp-post-${post.id}` }}
            >
              <button
                className={`post-image ${post.kind}`}
                onClick={() => open(post.id)}
                aria-label={`اقرأ مشاركة ${post.title}`}
              >
                <img src={post.image} alt={post.alt} width="720" height="540" loading="lazy" />
                <span className="post-category">{post.category}</span>
                <span className="post-open">
                  <ArrowUpLeft size={21} />
                </span>
              </button>
              <div className="post-copy">
                <span className="sample-label">نموذج توضيحي</span>
                <h3>
                  <button onClick={() => open(post.id)}>{post.title}</button>
                </h3>
                <p>{post.text}</p>
                <div className="post-author">
                  <span>
                    <Users size={16} />
                    {post.author}
                  </span>
                  <span>كلية التجارة</span>
                </div>
              </div>
            </article>
          ))}
      </div>
      {!full && (
        <div className="gallery-join">
          <div>
            <strong>لكل مشاركة حكاية. ما حكايتك؟</strong>
            <p>سجّل دخولك لقراءة النماذج كاملة، وابدأ تسجيل نشاطك.</p>
          </div>
          <Link className="lp-button lp-navy" to={session.user ? '/community' : '/login'}>
            {session.user ? 'استكشف المعرض' : 'الدخول ومتابعة الأنشطة'}
            <ArrowLeft size={18} />
          </Link>
        </div>
      )}
      <dialog
        ref={dialog}
        className="post-dialog"
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
        onClose={() => setSelected(null)}
      >
        <button
          autoFocus
          className="post-dialog-close"
          aria-label="إغلاق المشاركة"
          onClick={() => dialog.current?.close()}
        >
          <X />
        </button>
        {active && (
          <>
            <img src={active.image} alt={active.alt} width="720" height="540" />
            <div className="post-dialog-copy">
              <span className="sample-label">نموذج توضيحي — ليس مشاركة فعلية</span>
              <h2>{active.title}</h2>
              <p>{active.text}</p>
              <p>
                هذا نموذج لشكل منشور النشاط. مستندات الطالب واستمارة التسجيل لا تظهر في المعرض
                العام.
              </p>
              <Link
                className="lp-button lp-navy"
                to="/activity"
                onClick={() => dialog.current?.close()}
              >
                سجّل نشاطك
                <ArrowLeft size={17} />
              </Link>
            </div>
          </>
        )}
      </dialog>
    </>
  );
}

export function Landing() {
  const { session } = useSession();
  useEffect(() => {
    document.title = 'بوابة النشاط الطلابي | كلية التجارة — جامعة قناة السويس';
  }, []);
  return (
    <div className="landing-page">
      <LandingNav />
      <main id="main-content" tabIndex={-1}>
        <section className="lp-hero lp-container">
          <div className="lp-hero-copy">
            <img
              className="lp-identities"
              src={session.faculty.logoPath}
              alt="شعار كلية التجارة وشعار جامعة قناة السويس"
              width="2001"
              height="786"
              fetchPriority="high"
            />
            <p className="lp-institution">
              {session.faculty.university} / {session.faculty.faculty}
            </p>
            <h1>
              تجربة تستحق المشاركة.
              <br />
              ونشاط يصنع فارقًا.
            </h1>
            <p className="lp-hero-description">
              مساحتك لتشارك ما أنجزته، وتُلهم زملاءك، وتوثّق نشاطك الطلابي. من أول مشاركة، إلى
              استمارة جاهزة للطباعة واعتماد تتابعه من حسابك.
            </p>
            <div className="lp-hero-actions">
              <Link to={session.user ? '/dashboard' : '/login'} className="lp-button lp-navy">
                {session.user ? 'الذهاب إلى حسابي' : 'تسجيل الدخول'}
                <ArrowLeft size={19} />
              </Link>
              <Link to={session.user ? '/community' : '/register'} className="lp-button lp-outline">
                {session.user ? 'استكشف أنشطة الطلاب' : 'إنشاء حساب جديد'}
              </Link>
            </div>
            <a href="#activities" className="lp-browse">
              <span>
                <ArrowDown size={17} />
              </span>
              خذ جولة في أنشطة زملائك، بدون تسجيل
            </a>
          </div>
          <div className="lp-hero-art">
            <div className="lp-photo-frame">
              <img
                src="/photos/volunteer.webp"
                width="1024"
                height="1024"
                alt="صورة توضيحية مولّدة لطلاب يتعاونون في زراعة شجرة"
                fetchPriority="high"
              />
              <div className="lp-photo-caption">
                <span>
                  <Leaf size={19} />
                  من المشاركة، يبدأ التغيير
                </span>
                <small>صورة توضيحية مولّدة</small>
              </div>
            </div>
            <div className="lp-form-note">
              <span className="lp-note-icon">
                <FileText size={24} />
              </span>
              <div>
                <strong>مشاركتك، موثّقة.</strong>
                <span>سجّل نشاطك واستلم استمارتك</span>
              </div>
              <span className="lp-note-check">
                <Check size={17} />
              </span>
            </div>
            <div className="lp-art-label">نتعلّم. نشارك. نترك أثرًا.</div>
          </div>
        </section>
        <div className="lp-promise">
          <div className="lp-container">
            <span>
              <Users size={20} />
              مجتمع واحد يجمع طلاب التجارة
            </span>
            <span>
              <FileText size={20} />
              استمارة منظمة وجاهزة للطباعة
            </span>
            <span>
              <ShieldCheck size={20} />
              اعتماد واضح بعد المراجعة
            </span>
          </div>
        </div>
        <section className="lp-section lp-container" id="activities">
          <div className="lp-section-heading">
            <div>
              <span className="lp-kicker">من قلب الحياة الجامعية</span>
              <h2>
                مشاركات صغيرة.
                <br />
                حكايات تستحق أن تُروى.
              </h2>
            </div>
            <p>
              تطوّع، مبادرات، وخبرات نتبادلها.
              <br />
              استكشف شكل المشاركات التي ستجمعنا هنا.
              <small>المحتوى والصور التالية نماذج توضيحية للواجهة.</small>
            </p>
          </div>
          <ActivityGallery />
        </section>
        <section className="lp-journey" id="journey">
          <div className="lp-container">
            <div className="lp-journey-intro">
              <div>
                <span className="lp-kicker">من المشاركة إلى الاعتماد</span>
                <h2>
                  نشاط واحد.
                  <br />
                  خطوات واضحة.
                </h2>
                <p>كل خطوة في مكانها، وكل تحديث يظهر في حسابك.</p>
              </div>
              <div className="lp-points">
                <strong>٤٠</strong>
                <span>
                  درجة للنشاط الواحد<small>بعد المراجعة والاعتماد</small>
                </span>
              </div>
            </div>
            <ol className="lp-steps">
              {[
                ['سجّل مشاركتك', 'ادخل حسابك وأضف وصف نشاطك وصورته وبيانات المشاركة.', Users],
                ['اطبع استمارتك', 'راجع بياناتك، ثم نزّل الاستمارة الجاهزة واطبعها.', FileText],
                [
                  'سلّمها للموظف',
                  'توجّه للمكتب المحدد. يبحث الموظف برقمك الجامعي ويراجع الورق.',
                  ShieldCheck,
                ],
                ['تابع اعتماد نشاطك', 'بعد تأكيد الموظف، يظهر النشاط معتمدًا وتكتمل درجتك.', Check],
              ].map(([title, text, Icon], i) => {
                const StepIcon = Icon as typeof Users;
                return (
                  <li key={String(title)}>
                    <div className="lp-step-top">
                      <span>٠{['١', '٢', '٣', '٤'][i]}</span>
                      <StepIcon size={24} />
                    </div>
                    <h3>{String(title)}</h3>
                    <p>{String(text)}</p>
                  </li>
                );
              })}
            </ol>
            <p className="lp-journey-note">
              تقديم النشاط إلكترونيًا لا يمنح الدرجة تلقائيًا؛ تُحتسب بعد تسليم الاستمارة واعتماد
              الموظف المختص.
            </p>
          </div>
        </section>
        <section className="lp-section lp-container lp-faq" id="questions">
          <div>
            <span className="lp-kicker">قبل أن تبدأ</span>
            <h2>
              أسئلة في بالك؟
              <br />
              إجاباتها هنا.
            </h2>
            <p>معلومات تساعدك تكمل خطواتك بثقة.</p>
          </div>
          <div className="lp-faq-list">
            {faqs.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <ChevronDown size={19} />
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="lp-container lp-closing">
          <div>
            <h2>خطوتك القادمة تبدأ هنا.</h2>
            <p>وثّق تجربتك، وخلّي مشاركتك جزءًا من حكاية الكلية.</p>
          </div>
          <Link className="lp-button lp-white" to="/register">
            ابدأ بإنشاء حساب
            <ArrowLeft size={19} />
          </Link>
        </section>
      </main>
      <footer className="lp-footer lp-container">
        <div>
          <strong>{session.faculty.faculty}</strong>
          <span>{session.faculty.university} — بوابة النشاط الطلابي</span>
        </div>
        <p>
          نسخة للعرض والتجربة.{' '}
          {session.preview
            ? 'الحسابات والبيانات محفوظة في متصفحك فقط.'
            : 'الربط الرسمي والتحقق من الهوية غير مفعّلين.'}
        </p>
        <a href="#questions">
          الدليل والأسئلة الشائعة
          <ArrowUpLeft size={16} />
        </a>
      </footer>
    </div>
  );
}

export function Register() {
  const { session, refresh } = useSession();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError('');
    try {
      await api('/register', { method: 'POST', body: JSON.stringify(data) });
      await refresh();
      navigate('/dashboard');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="lp-register" id="main-content" tabIndex={-1}>
      <Link className="lp-back" to="/">
        <ArrowLeft size={18} />
        العودة إلى الصفحة الرئيسية
      </Link>
      <section>
        <img src={session.faculty.logoPath} width="2001" height="786" alt="شعار الجامعة والكلية" />
        <span className="lp-kicker">أول خطوة في تجربتك</span>
        <h1>إنشاء حساب طالب</h1>
        {session.preview ? (
          <>
            <p>
              حساب تجريبي داخل متصفحك فقط. استخدم بيانات وهمية؛ التحقق من القيد الجامعي غير مفعّل.
            </p>
            <form onSubmit={submit}>
              <label>
                الاسم الكامل
                <input name="name" required minLength={3} maxLength={100} autoComplete="name" />
              </label>
              <label>
                الرقم الجامعي
                <input
                  name="student_id"
                  required
                  pattern="[0-9]{4,20}"
                  inputMode="numeric"
                  dir="ltr"
                  title="من ٤ إلى ٢٠ رقمًا"
                />
              </label>
              <label>
                البريد الإلكتروني
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  dir="ltr"
                  maxLength={160}
                />
              </label>
              <label>
                كلمة المرور التجريبية
                <input
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  maxLength={100}
                  autoComplete="new-password"
                  dir="ltr"
                />
                <small>٨ أحرف على الأقل. لا تستخدم كلمة مرور حقيقية.</small>
              </label>
              <label>
                الفرقة الدراسية
                <select name="year" required>
                  <option value="">اختر الفرقة</option>
                  {['الأولى', 'الثانية', 'الثالثة', 'الرابعة'].map((y) => (
                    <option key={y}>الفرقة {y}</option>
                  ))}
                </select>
              </label>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button className="lp-button lp-navy" disabled={busy}>
                {busy ? 'جارٍ إنشاء الحساب…' : 'إنشاء الحساب التجريبي'}
                <ArrowLeft size={18} />
              </button>
            </form>
          </>
        ) : (
          <div className="lp-registration-notice">
            <ShieldCheck size={30} />
            <h2>تفعيل التسجيل بعد اعتماد التحقق الجامعي</h2>
            <p>
              إنشاء الحسابات العامة غير متاح في نسخة الخادم الحالية. ستُفعّل وسيلة التسجيل المعتمدة
              بعد التنسيق مع الكلية لضمان اقتصار الحسابات على طلابها.
            </p>
            <Link className="lp-button lp-navy" to="/login">
              الدخول بحساب متاح
              <ArrowLeft size={18} />
            </Link>
          </div>
        )}
        <p className="lp-register-login">
          عندك حساب بالفعل؟ <Link to="/login">تسجيل الدخول</Link>
        </p>
      </section>
    </main>
  );
}
