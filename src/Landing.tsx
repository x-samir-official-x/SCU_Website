import { Fragment, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  Eye,
  EyeOff,
} from 'lucide-react';
import { api, logoSrc, useSession } from './lib';
import type { GalleryPost } from './types';
import { TERMS } from './terms';
import { validateRegistration } from './registration';
import { Ambient } from './Ambient';
import { FloatingNav } from './FloatingNav';
import { useCountUp, usePointerParallax, useReveal } from './hooks';
import './landing.css';

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
    'لا. مرفقاتك وبياناتك الشخصية داخل طلبك لا تظهر لأحد. وإن اخترت نشر صورة نشاطك في المعرض، تظهر الصورة ووصف النشاط فقط بدون اسمك أو رقمك الجامعي، ويمكنك سحب موافقتك في أي وقت. النشر في المعرض لا يعني اعتماد النشاط ولا يمنح أي درجة.',
  ],
];

type ShowPost = (typeof posts)[number] & { real?: boolean; byName?: string | null };
const MIN_CARDS = 3;
export function ActivityGallery({ full = false }: { full?: boolean }) {
  const [filter, setFilter] = useState('الكل');
  const [selected, setSelected] = useState<string | null>(null);
  const [realPosts, setRealPosts] = useState<GalleryPost[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const PAGE = 9;
  useEffect(() => {
    let current = true;
    api<{ posts: GalleryPost[]; hasMore: boolean }>(`/gallery?limit=${PAGE}&offset=0`)
      .then((r) => {
        if (!current) return;
        setRealPosts(r.posts);
        setHasMore(r.hasMore);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, []);
  async function loadMore() {
    setLoadingMore(true);
    try {
      const r = await api<{ posts: GalleryPost[]; hasMore: boolean }>(
        `/gallery?limit=${PAGE}&offset=${realPosts.length}`,
      );
      setRealPosts((old) => [...old, ...r.posts.filter((p) => !old.some((o) => o.id === p.id))]);
      setHasMore(r.hasMore);
    } catch {
      /* يمكن المحاولة مرة أخرى */
    } finally {
      setLoadingMore(false);
    }
  }
  // المنشورات الحقيقية أولًا (بدون اسم الطالب: المصدر هو الجهة/الفريق)، وتُكمَّل النماذج التوضيحية حتى ٣ بطاقات.
  const shown: ShowPost[] = [
    ...realPosts.map<ShowPost>((p) => ({
      id: `real-${p.id}`,
      category: p.category,
      title: p.title,
      text: p.text,
      image: p.image,
      alt: `صورة من نشاط: ${p.title}`,
      author: p.organization,
      byName: p.author,
      kind: 'photo',
      real: true,
    })),
    ...posts.slice(0, Math.max(0, MIN_CARDS - realPosts.length)),
  ];
  const categories = ['الكل', ...Array.from(new Set(shown.map((p) => p.category)))];
  const active = shown.find((p) => p.id === selected);
  const navigate = useNavigate();
  const { session } = useSession();
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
        {categories.map((item) => (
          <button key={item} aria-pressed={filter === item} onClick={() => setFilter(item)}>
            {item}
          </button>
        ))}
      </div>
      <div className="activity-showcase">
        {shown
          .filter((p) => filter === 'الكل' || p.category === filter)
          .map((post) => (
            <article className="public-post" key={post.id}>
              <button
                className={`post-image ${post.kind}`}
                onClick={() => open(post.id)}
                aria-label={`اقرأ مشاركة ${post.title}`}
              >
                <img
                  src={post.image}
                  alt={post.alt}
                  width="720"
                  height="540"
                  loading="lazy"
                  decoding="async"
                />
                <span className="post-category">{post.category}</span>
                <span className="post-open">
                  <ArrowUpLeft size={21} />
                </span>
              </button>
              <div className="post-copy">
                {!post.real && <span className="sample-label">نموذج توضيحي</span>}
                <h3>
                  <button onClick={() => open(post.id)}>{post.title}</button>
                </h3>
                <p>{post.text}</p>
                <div className="post-author">
                  <span>
                    <Users size={16} />
                    {post.byName ? `${post.byName} · ${post.author}` : post.author}
                  </span>
                  <span>{session.faculty.faculty}</span>
                </div>
              </div>
            </article>
          ))}
      </div>
      {hasMore && (
        <div className="gallery-more">
          <button className="lp-button lp-navy" disabled={loadingMore} onClick={loadMore}>
            {loadingMore ? 'جارٍ التحميل…' : 'عرض المزيد'}
          </button>
        </div>
      )}
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
              {!active.real && (
                <span className="sample-label">نموذج توضيحي — ليس مشاركة فعلية</span>
              )}
              <h2>{active.title}</h2>
              <p>{active.text}</p>
              <p>
                {active.real
                  ? 'نُشرت هذه المشاركة بموافقة صاحبها، بدون اسمه أو بياناته. نشرها لا يعني اعتماد النشاط أو احتساب درجته.'
                  : 'هذا نموذج لشكل منشور النشاط. مستندات الطالب واستمارة التسجيل لا تظهر في المعرض العام.'}
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

function Words({ text, start = 0 }: { text: string; start?: number }) {
  const words = text.split(' ');
  return (
    <>
      {words.map((word, i) => (
        <Fragment key={`${word}-${i}`}>
          <span className="px-w">
            <span style={{ '--i': start + i } as CSSProperties}>{word}</span>
          </span>
          {i < words.length - 1 && ' '}
        </Fragment>
      ))}
    </>
  );
}

const steps = [
  ['سجّل مشاركتك', 'ادخل حسابك وأضف وصف نشاطك وصورته وبيانات المشاركة.', Users],
  ['اطبع استمارتك', 'راجع بياناتك، ثم نزّل الاستمارة الجاهزة واطبعها.', FileText],
  ['سلّمها للموظف', 'توجّه للمكتب المحدد. يبحث الموظف برقمك الجامعي ويراجع الورق.', ShieldCheck],
  ['تابع اعتماد نشاطك', 'بعد تأكيد الموظف، يظهر النشاط معتمدًا وتكتمل درجتك.', Check],
] as const;

const delay = (n: number) => ({ '--d': n }) as CSSProperties;

export function Landing() {
  const { session } = useSession();
  const heroRef = useRef<HTMLElement>(null);
  const scoreRef = useRef<HTMLSpanElement>(null);
  const score = useCountUp(scoreRef, 40);
  useReveal();
  usePointerParallax(heroRef);
  useEffect(() => {
    const f = session.faculty;
    document.title = `${f.platformName} | ${f.brand} — ${f.faculty} | ${f.university}`;
  }, [session.faculty]);
  const signedIn = Boolean(session.user);
  return (
    <div className="landing-page px-page">
      <FloatingNav parallaxRef={heroRef} />
      <main id="main-content" tabIndex={-1}>
        <section className="px-hero" ref={heroRef}>
          <div className="px-hero-bg" aria-hidden="true">
            <picture>
              <source media="(max-width: 700px)" srcSet="/photos/hero-mobile.webp" />
              <img
                src="/photos/hero.webp"
                width="1694"
                height="928"
                alt=""
                fetchPriority="high"
                decoding="async"
              />
            </picture>
          </div>
          <Ambient variant="hero" />
          <div className="px-wrap px-hero-grid">
            <div className="px-hero-copy">
              <div className="px-brand">
                <span className="px-brand-name" lang="ar">
                  {session.faculty.platformName}
                </span>
                <span className="px-brand-sub">{session.faculty.brand}</span>
              </div>
              <p className="px-chip">
                <span className="px-chip-dot" />
                {session.faculty.faculty} | {session.faculty.university}
              </p>
              <h1 className="px-h1">
                <span className="px-line">
                  <Words text="تجربة تستحق المشاركة." />
                </span>
                <span className="px-line px-grad">
                  <Words text="ونشاط يصنع فارقًا." start={3} />
                </span>
              </h1>
              <p className="px-lead">
                مساحتك لتشارك ما أنجزته، وتُلهم زملاءك، وتوثّق نشاطك الطلابي. من أول مشاركة، إلى
                استمارة جاهزة للطباعة واعتماد تتابعه من حسابك.
              </p>
              <div className="px-actions">
                <Link to={signedIn ? '/dashboard' : '/login'} className="px-btn px-btn-light">
                  <span>{signedIn ? 'الذهاب إلى حسابي' : 'تسجيل الدخول'}</span>
                  <ArrowLeft size={19} />
                </Link>
                <Link to={signedIn ? '/community' : '/register'} className="px-btn px-btn-glass">
                  <span>{signedIn ? 'استكشف أنشطة الطلاب' : 'إنشاء حساب جديد'}</span>
                </Link>
              </div>
              <a href="#activities" className="px-browse">
                <span>
                  <ArrowDown size={16} />
                </span>
                خذ جولة في أنشطة زملائك، بدون تسجيل
              </a>
            </div>
            <div className="px-hero-art">
              <span className="px-orbit px-orbit-a" aria-hidden="true" />
              <span className="px-orbit px-orbit-b" aria-hidden="true" />
              <figure className="px-arch">
                <img
                  src="/photos/volunteer.webp"
                  width="1000"
                  height="667"
                  alt="صورة توضيحية مولّدة لطلاب يتعاونون في زراعة شجرة"
                  fetchPriority="high"
                />
                <figcaption>
                  <span>
                    <Leaf size={18} />
                    من المشاركة، يبدأ التغيير
                  </span>
                  <small>صورة توضيحية مولّدة</small>
                </figcaption>
              </figure>
              <div className="px-float px-float-note">
                <span className="px-float-icon">
                  <FileText size={22} />
                </span>
                <div>
                  <strong>مشاركتك، موثّقة.</strong>
                  <span>سجّل نشاطك واستلم استمارتك</span>
                </div>
                <span className="px-float-check">
                  <Check size={16} />
                </span>
              </div>
              <div className="px-float px-float-score">
                <svg viewBox="0 0 64 64" aria-hidden="true">
                  <circle cx="32" cy="32" r="26" className="px-ring-bg" />
                  <circle cx="32" cy="32" r="26" className="px-ring-fg" pathLength="100" />
                </svg>
                <div>
                  <strong>٤٠ درجة</strong>
                  <span>للنشاط الواحد المعتمد</span>
                </div>
              </div>
              <p className="px-art-label">نتعلّم. نشارك. نترك أثرًا.</p>
            </div>
          </div>
          <div className="px-wrap">
            <ul className="px-promise">
              <li>
                <Users size={20} />
                مجتمع واحد يجمع طلاب {session.faculty.facultyShort}
              </li>
              <li>
                <FileText size={20} />
                استمارة منظمة وجاهزة للطباعة
              </li>
              <li>
                <ShieldCheck size={20} />
                اعتماد واضح بعد المراجعة
              </li>
            </ul>
          </div>
        </section>

        <section className="px-section px-wrap px-activities" id="activities">
          <div className="px-heading" data-reveal="up">
            <div>
              <span className="px-kicker">من قلب الحياة الجامعية</span>
              <h2>
                مشاركات صغيرة.
                <br />
                <em>حكايات تستحق أن تُروى.</em>
              </h2>
            </div>
            <p>
              تطوّع، مبادرات، وخبرات نتبادلها. استكشف شكل المشاركات التي ستجمعنا هنا.
              <small>
                المشاركات الحقيقية تُنشر بموافقة أصحابها وبدون أسمائهم، وما عداها نماذج توضيحية.
              </small>
            </p>
          </div>
          <div data-reveal="up" style={delay(1)}>
            <ActivityGallery />
          </div>
        </section>

        <section className="px-slab" id="journey">
          <Ambient variant="slab" />
          <div className="px-wrap px-slab-inner">
            <div className="px-journey-intro">
              <div data-reveal="up">
                <span className="px-kicker px-kicker-light">من المشاركة إلى الاعتماد</span>
                <h2>
                  نشاط واحد.
                  <br />
                  <em>خطوات واضحة.</em>
                </h2>
                <p>كل خطوة في مكانها، وكل تحديث يظهر في حسابك.</p>
              </div>
              <div className="px-score" data-reveal="scale" style={delay(1)}>
                <svg viewBox="0 0 120 120" aria-hidden="true">
                  <circle cx="60" cy="60" r="52" className="px-score-bg" />
                  <circle cx="60" cy="60" r="52" className="px-score-fg" pathLength="100" />
                </svg>
                <div>
                  <strong ref={scoreRef} aria-label="٤٠">
                    {score.toLocaleString('ar-EG')}
                  </strong>
                  <span>درجة للنشاط الواحد</span>
                  <small>بعد المراجعة والاعتماد</small>
                </div>
              </div>
            </div>
            <ol className="px-steps" data-reveal="line">
              {steps.map(([title, text, Icon], i) => (
                <li key={title} data-reveal="up" style={delay(i + 1)}>
                  <div className="px-step-top">
                    <span className="px-step-n">٠{['١', '٢', '٣', '٤'][i]}</span>
                    <span className="px-step-icon">
                      <Icon size={22} />
                    </span>
                  </div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </li>
              ))}
            </ol>
            <p className="px-note" data-reveal="fade">
              تقديم النشاط إلكترونيًا لا يمنح الدرجة تلقائيًا؛ تُحتسب بعد تسليم الاستمارة واعتماد
              الموظف المختص.
            </p>
          </div>
        </section>

        <section className="px-section px-wrap px-faq" id="questions">
          <div className="px-faq-intro" data-reveal="up">
            <span className="px-kicker">قبل أن تبدأ</span>
            <h2>
              أسئلة في بالك؟
              <br />
              <em>إجاباتها هنا.</em>
            </h2>
            <p>معلومات تساعدك تكمل خطواتك بثقة.</p>
          </div>
          <div className="px-faq-list">
            {faqs.map(([question, answer], i) => (
              <details key={question} data-reveal="up" style={delay(i + 1)}>
                <summary>
                  <span>{question}</span>
                  <span className="px-faq-icon" aria-hidden="true">
                    <ChevronDown size={18} />
                  </span>
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="px-wrap">
          <div className="px-closing" data-reveal="scale">
            <Ambient variant="card" />
            <div>
              <h2>خطوتك القادمة تبدأ هنا.</h2>
              <p>وثّق تجربتك، وخلّي مشاركتك جزءًا من حكاية الكلية.</p>
            </div>
            <Link className="px-btn px-btn-light" to={signedIn ? '/dashboard' : '/register'}>
              <span>{signedIn ? 'الذهاب إلى حسابي' : 'ابدأ بإنشاء حساب'}</span>
              <ArrowLeft size={19} />
            </Link>
          </div>
        </section>
      </main>
      <footer className="px-footer">
        <div className="px-wrap px-footer-inner">
          <div className="px-footer-id">
            <span className="px-footer-logos">
              <img
                src={logoSrc(session.faculty.logoPath)}
                width="2001"
                height="786"
                alt={`شعارا ${session.faculty.university} و${session.faculty.faculty}`}
                decoding="async"
              />
            </span>
            <div>
              <strong>{session.faculty.faculty}</strong>
              <span>{session.faculty.university} — بوابة النشاط الطلابي</span>
            </div>
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
        </div>
      </footer>
    </div>
  );
}

export function Register() {
  const { session, refresh } = useSession();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [invalid, setInvalid] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const bad = (field: string) => (invalid === field ? true : undefined);
  const open = Boolean(session.preview || session.registration);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const data = Object.fromEntries(form) as Record<string, unknown>;
    data.accepted_terms = form.get('accepted_terms') === 'on';
    // نفس قواعد الخادم، برسائل عربية بدل رسائل المتصفح الإنجليزية (التحقق النهائي في الخادم أيضًا).
    const checked = validateRegistration(data);
    if (!checked.ok) {
      setError(checked.error);
      setInvalid(checked.field ?? '');
      // التركيز على الحقل المعنيّ (والتمرير إليه) بدل ترك الرسالة وحدها أسفل النموذج.
      const field = checked.field ? event.currentTarget.elements.namedItem(checked.field) : null;
      if (field instanceof HTMLElement) field.focus();
      return;
    }
    setInvalid('');
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
        <img
          src={logoSrc(session.faculty.logoPath)}
          width="2001"
          height="786"
          alt="شعار الجامعة والكلية"
        />
        <span className="lp-kicker">أول خطوة في تجربتك</span>
        <h1>إنشاء حساب طالب</h1>
        {open ? (
          <>
            <p>
              {session.preview
                ? 'حساب تجريبي داخل متصفحك فقط. استخدم بيانات وهمية؛ التحقق من القيد الجامعي غير مفعّل.'
                : 'أنشئ حسابك لتسجيل نشاطك ومتابعة اعتماده.'}
            </p>
            <form
              onSubmit={submit}
              noValidate
              className="lp-register-form"
              onInput={() => invalid && setInvalid('')}
            >
              <label className="lp-span-2">
                الاسم الكامل
                <input
                  name="name"
                  required
                  minLength={3}
                  maxLength={100}
                  autoComplete="name"
                  aria-invalid={bad('name')}
                />
              </label>
              <fieldset className="lp-ids lp-span-2">
                <legend>اكتب أحد الرقمين على الأقل</legend>
                <label>
                  الرقم الجامعي (الموجود على الكارنيه)
                  <input
                    name="student_id"
                    aria-invalid={bad('student_id')}
                    inputMode="numeric"
                    dir="ltr"
                    maxLength={20}
                    autoComplete="off"
                  />
                </label>
                <label>
                  الرقم القومي
                  <input
                    name="national_id"
                    aria-invalid={bad('national_id')}
                    inputMode="numeric"
                    dir="ltr"
                    maxLength={20}
                    autoComplete="off"
                  />
                </label>
                <small>يكفي واحد منهما، ويمكنك كتابة الاثنين. لا يظهر أي منهما لزوار الموقع.</small>
              </fieldset>
              <label>
                البريد الإلكتروني
                <input
                  name="email"
                  aria-invalid={bad('email')}
                  type="email"
                  required
                  autoComplete="email"
                  dir="ltr"
                  maxLength={160}
                />
              </label>
              <label>
                رقم الموبايل (اختياري)
                <input
                  name="phone"
                  aria-invalid={bad('phone')}
                  type="tel"
                  inputMode="tel"
                  dir="ltr"
                  maxLength={20}
                  autoComplete="tel"
                  placeholder="01xxxxxxxxx"
                />
                <small>يراه الموظف المختص فقط، للتواصل بشأن طلبك.</small>
              </label>
              <label>
                {session.preview ? 'كلمة المرور التجريبية' : 'كلمة المرور'}
                <span className="lp-password">
                  <input
                    name="password"
                    aria-invalid={bad('password')}
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    maxLength={100}
                    autoComplete="new-password"
                    dir="ltr"
                  />
                  <button
                    type="button"
                    className="lp-password-toggle"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </span>
                <small>
                  ٨ أحرف على الأقل، ولا تكون شائعة (مثل 12345678) ولا تحتوي بريدك أو رقمك.
                  {session.preview ? ' لا تستخدم كلمة مرور حقيقية.' : ''}
                </small>
              </label>
              <label>
                الفرقة الدراسية
                <select name="year" required aria-invalid={bad('year')}>
                  <option value="">اختر الفرقة</option>
                  {['الأولى', 'الثانية', 'الثالثة', 'الرابعة'].map((y) => (
                    <option key={y}>الفرقة {y}</option>
                  ))}
                </select>
              </label>
              <details className="lp-terms lp-span-2">
                <summary>اقرأ شروط الاستخدام</summary>
                <ol>
                  {TERMS.map((t) => (
                    <li key={t.title}>
                      <strong>{t.title}:</strong> {t.text}
                    </li>
                  ))}
                </ol>
              </details>
              <label className="checkbox-label lp-terms-accept lp-span-2">
                <input
                  type="checkbox"
                  name="accepted_terms"
                  required
                  aria-invalid={bad('accepted_terms')}
                />
                <span>قرأت شروط الاستخدام وأوافق عليها.</span>
              </label>
              {error && (
                <p
                  className="form-error lp-span-2"
                  role="alert"
                  ref={(el) => el?.scrollIntoView({ block: 'center', behavior: 'smooth' })}
                >
                  {error}
                </p>
              )}
              <button className="lp-button lp-navy lp-span-2" disabled={busy}>
                {busy
                  ? 'جارٍ إنشاء الحساب…'
                  : session.preview
                    ? 'إنشاء الحساب التجريبي'
                    : 'إنشاء الحساب'}
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
