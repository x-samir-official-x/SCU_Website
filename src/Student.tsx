import { isBrowserPreview } from './preview-bootstrap';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpLeft,
  CalendarDays,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronLeft,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  Download,
  FileCheck2,
  FileText,
  FileUp,
  FolderOpen,
  GraduationCap,
  Leaf,
  LoaderCircle,
  Paperclip,
  Plus,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import {
  api,
  Badge,
  date,
  Empty,
  ErrorPanel,
  Loading,
  number,
  requestNumber,
  useData,
  useSession,
  useToast,
  useModalFocus,
  usePresence,
} from './lib';
import type { ActivityRequest, Attachment } from './types';
import { AcademicSeal } from './Brand';
import { GalleryOptIn } from './GalleryOptIn';
import { FormAssistant } from './FormAssistant';
import type { Suggestion } from './assistant';

export function ProgressRing({ approved, large = false }: { approved: boolean; large?: boolean }) {
  return (
    <div
      className={`progress-ring ${large ? 'large' : ''}`}
      role="img"
      aria-label={`درجة النشاط: ${approved ? '٤٠' : '٠'} من ٤٠`}
    >
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="ring-track" cx="60" cy="60" r="50" />
        <circle
          className="ring-value"
          cx="60"
          cy="60"
          r="50"
          strokeDasharray="314.16"
          strokeDashoffset={approved ? 0 : 314.16}
        />
      </svg>
      <div>
        <strong>{approved ? '٤٠' : '٠'}</strong>
        <span>من ٤٠ درجة</span>
      </div>
    </div>
  );
}
export function StudentDashboard() {
  const { session } = useSession();
  const user = session.user!;
  const { data, loading, error, reload } = useData<{ request: ActivityRequest | null }>(
    '/requests/mine',
  );
  if (loading) return <Loading />;
  if (error) return <ErrorPanel message={error} retry={reload} />;
  const r = data?.request;
  const approved = r?.status === 'approved';
  const editable = !r || ['draft', 'revision'].includes(r.status);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">
            <span className="live-dot" />
            خدمات الطلاب
          </span>
          <h1>أهلًا، {user.name.split(' ')[0]}</h1>
          <p>سجّل نشاطك، وتابع حالة الطلب والخطوة المطلوبة منك.</p>
        </div>
        <div className="date-chip">
          <CalendarDays size={17} />
          {date(new Date().toISOString())}
        </div>
      </div>
      <section className="hero institutional-hero">
        <div className="hero-content">
          <span className="hero-label">
            <ShieldCheck size={16} aria-hidden="true" />
            بوابة النشاط الطلابي · كلية التجارة
          </span>
          <h2>
            {approved
              ? 'تم اعتماد نشاطك الجامعي.'
              : r?.status === 'revision'
                ? 'خطوة لاستكمال طلبك.'
                : 'نشاطك الجامعي، بخطوات واضحة.'}
          </h2>
          <p>
            {approved
              ? 'اكتمل استحقاق النشاط وأُضيفت ٤٠ درجة إلى سجلك.'
              : r?.status === 'pending'
                ? 'طلبك بانتظار المراجعة. نزّل الاستمارة وقدّمها إلى المكتب المختص.'
                : 'قدّم بيانات مشاركتك ومستنداتها، واستخرج الاستمارة، ثم تابع المراجعة والاعتماد.'}
          </p>
          <div className="hero-actions">
            <Link to="/activity" className="button hero-button">
              {editable
                ? r?.status === 'revision'
                  ? 'استكمال طلبي'
                  : r
                    ? 'استكمال النشاط'
                    : 'سجّل نشاطك الآن'
                : 'متابعة نشاطي'}
              <ArrowLeft size={18} aria-hidden="true" />
            </Link>
            <Link to="/guide" className="hero-guide">
              خطوات التقديم <ArrowUpLeft size={16} aria-hidden="true" />
            </Link>
          </div>
          <div className="hero-footnote">
            <ShieldCheck size={14} aria-hidden="true" />
            نشاط واحد · ٤٠ درجة بعد الاعتماد
          </div>
        </div>
        <AcademicSeal />
      </section>
      <section className="stats-grid student-stats">
        <Stat
          icon={<ClipboardCheck />}
          label="النشاط المطلوب"
          value="نشاط واحد"
          detail="خلال الفترة المعتمدة"
        />
        <Stat
          icon={<Clock3 />}
          label="حالة الطلب"
          value={r ? <Badge status={r.status} /> : 'لم تقدم بعد'}
          detail={r ? requestNumber(r.id) : 'رحلتك تبدأ بتسجيل نشاطك'}
          tone="sand"
        />
        <Stat
          icon={<GraduationCap />}
          label="الدرجة المعتمدة"
          value={
            <>
              {approved ? '٤٠' : '٠'} <small>/ ٤٠</small>
            </>
          }
          detail={approved ? 'تم استيفاء النشاط' : 'تُضاف بعد مراجعة الموظف'}
          tone="blue"
        />
      </section>
      <div className="dashboard-grid">
        <section className="card activity-card">
          <div className="card-heading">
            <div>
              <h2>نشاطي الحالي</h2>
              <p>آخر تحديثات طلبك في مكان واحد</p>
            </div>
            <Link className="text-button" to="/activity">
              عرض التفاصيل <ChevronLeft size={16} />
            </Link>
          </div>
          {r ? (
            <div className="current-activity">
              <div className="activity-summary">
                <span className="activity-icon">
                  <FileCheck2 size={24} />
                </span>
                <div>
                  <span className="mini-label">{r.category || 'طلب نشاط جديد'}</span>
                  <h3>{r.title || 'مسودة نشاطك'}</h3>
                  <span className="muted small-text">
                    {requestNumber(r.id)} · آخر تحديث {date(r.updated_at)}
                  </span>
                </div>
                <Badge status={r.status} />
              </div>
              <Journey request={r} />
              {r.review_note && (
                <div className={`review-note ${r.status === 'approved' ? 'success' : ''}`}>
                  <ClipboardCheck size={19} />
                  <div>
                    <strong>ملاحظة الموظف</strong>
                    <p>{r.review_note}</p>
                  </div>
                </div>
              )}
              <div className="activity-card-bottom">
                <span>
                  <ShieldCheck size={16} />
                  بياناتك محفوظة في حسابك
                </span>
                {r.version > 0 && (
                  <a
                    className="text-button"
                    href={`/api/requests/${r.id}/form`}
                    target={isBrowserPreview ? '_blank' : undefined}
                    rel="noopener"
                  >
                    {isBrowserPreview ? 'عرض وطباعة الاستمارة' : 'تنزيل الاستمارة'}{' '}
                    <Download size={16} />
                  </a>
                )}
              </div>
            </div>
          ) : (
            <Empty
              icon={<FileText size={33} />}
              title="ابدأ بتسجيل نشاطك"
              text="أضف بيانات مشاركتك وارفع المستندات المؤيدة. يمكنك حفظ مسودة واستكمالها قبل التقديم."
              action={
                <Link className="button secondary" to="/activity">
                  <Plus size={17} />
                  تسجيل نشاط جديد
                </Link>
              }
            />
          )}
        </section>
        <section className="card achievement-card">
          <div className="card-heading">
            <div>
              <h2>استحقاق النشاط</h2>
              <p>نشاط واحد خلال الفترة المعتمدة</p>
            </div>
          </div>
          <ProgressRing approved={approved} large />
          <h3>{approved ? 'اكتمل استحقاق النشاط' : 'في انتظار اعتماد النشاط'}</h3>
          <p>
            {approved
              ? 'تم اعتماد نشاطك وإضافة ٤٠ درجة كاملة.'
              : 'تكتمل الدرجة بعد تسليم الاستمارة ومراجعة النشاط واعتماده.'}
          </p>
          <span className={`achievement-note ${approved ? 'done' : ''}`}>
            <CheckCircle2 size={15} />
            {approved ? 'تم اعتماد النشاط' : '٤٠ درجة للنشاط المعتمد'}
          </span>
        </section>
      </div>
      <section className="card steps-card">
        <div className="card-heading">
          <div>
            <span className="section-kicker">دليل التقديم</span>
            <h2>من المشاركة إلى الاعتماد</h2>
          </div>
          <Link to="/guide" className="text-button">
            الدليل الكامل <ArrowUpLeft size={16} />
          </Link>
        </div>
        <div className="steps-grid">
          {[
            { icon: FileText, title: 'سجّل نشاطك', desc: 'أدخل بيانات المشاركة وارفع المستندات.' },
            {
              icon: Download,
              title: 'اطبع الاستمارة',
              desc: 'نزّل نسخة جاهزة للطباعة بعد التقديم.',
            },
            { icon: ClipboardCheck, title: 'سلّم للمراجعة', desc: 'قدّم الاستمارة للمكتب المختص.' },
            { icon: CheckCheck, title: 'تابع الاعتماد', desc: 'تُضاف الدرجة بعد اعتماد الموظف.' },
          ].map((step, i) => (
            <div className="step" key={step.title}>
              <div className="step-icon">
                <step.icon size={23} />
                <span>{number(i + 1)}</span>
              </div>
              <h3>{step.title}</h3>
              <p>{step.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
export function Stat({
  icon,
  label,
  value,
  detail,
  tone = 'green',
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  detail: string;
  tone?: string;
}) {
  return (
    <article className="stat-card">
      <div>
        <span className="stat-label">{label}</span>
        <strong className="stat-value">{value}</strong>
        <span className="stat-detail">{detail}</span>
      </div>
      <span className={`stat-icon ${tone}`}>{icon}</span>
    </article>
  );
}
export function Journey({ request: r }: { request: ActivityRequest }) {
  const steps = [
    { label: 'تسجيل النشاط', done: r.version > 0, active: r.status === 'draft' },
    {
      label: 'تسليم ومراجعة',
      done: r.status === 'approved',
      active: ['pending', 'revision'].includes(r.status),
    },
    { label: 'اعتماد النشاط', done: r.status === 'approved', active: false },
  ];
  return (
    <div className="journey">
      {steps.map((s, i) => (
        <div
          key={s.label}
          className={`journey-step ${s.done ? 'done' : ''} ${s.active ? 'active' : ''}`}
        >
          <span>{s.done ? <Check size={15} /> : number(i + 1)}</span>
          <small>{s.label}</small>
        </div>
      ))}
    </div>
  );
}
export function Attachments({
  files = [],
  canDelete = false,
  onDelete,
}: {
  files?: Attachment[];
  canDelete?: boolean;
  onDelete?: (id: number) => void;
}) {
  return (
    <div className="attachment-list">
      {files.map((file) => (
        <div className="attachment" key={file.id}>
          <span className={`file-icon ${file.mime === 'application/pdf' ? 'pdf' : ''}`}>
            <FileText size={21} />
          </span>
          <div>
            <a href={`/api/attachments/${file.id}`} className="file-name">
              {file.original_name}
            </a>
            <small>
              {(file.size / 1024).toFixed(0)} KB ·{' '}
              {file.mime === 'application/pdf' ? 'PDF' : 'صورة'}
            </small>
          </div>
          <a
            className="icon-button"
            href={`/api/attachments/${file.id}`}
            aria-label={`تنزيل ${file.original_name}`}
          >
            <Download size={17} />
          </a>
          {canDelete && (
            <button
              className="icon-button danger-text"
              type="button"
              onClick={() => onDelete?.(file.id)}
              aria-label={`حذف ${file.original_name}`}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
export function ActivityPage() {
  const { session } = useSession();
  const user = session.user!;
  const toast = useToast();
  const navigate = useNavigate();
  const state = useData<{ request: ActivityRequest | null }>('/requests/mine');
  const [form, setForm] = useState({
    title: '',
    category: '',
    organization: '',
    activity_date: '',
    description: '',
  });
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState(false);
  const confirmPresence = usePresence(confirm);
  const [declared, setDeclared] = useState(false);
  const [validation, setValidation] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const r = state.data?.request;
  const editable = !r || ['draft', 'revision'].includes(r.status);
  useModalFocus(confirm, () => {
    if (!busy) setConfirm(false);
  });
  useEffect(() => {
    if (r)
      setForm({
        title: r.title,
        category: r.category,
        organization: r.organization,
        activity_date: r.activity_date,
        description: r.description,
      });
  }, [r?.id, r?.updated_at]);
  const set = (key: keyof typeof form, value: string) => {
    setForm((old) => ({ ...old, [key]: value }));
    setValidation('');
  };
  async function ensureRequest() {
    if (r) return r;
    const result = await api<{ request: ActivityRequest }>('/requests', {
      method: 'POST',
      body: '{}',
    });
    state.setData(result);
    return result.request;
  }
  async function saveDraft(showToast = true) {
    const request = await ensureRequest();
    const result = await api<{ request: ActivityRequest }>(`/requests/${request.id}`, {
      method: 'PUT',
      body: JSON.stringify(form),
    });
    state.setData(result);
    if (showToast) toast('تم حفظ المسودة. تقدر ترجع تكملها في أي وقت.');
    return result.request;
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy('save');
    try {
      await saveDraft();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy('');
    }
  }
  async function upload(file: File) {
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type))
      return toast('اختر ملف PDF أو صورة JPG أو PNG.', true);
    if (file.size > 8 * 1024 * 1024) return toast('الحد الأقصى لحجم الملف ٨ ميجابايت.', true);
    setBusy('upload');
    try {
      const request = await saveDraft(false);
      const body = new FormData();
      body.append('file', file);
      const result = await api<{ request: ActivityRequest }>(
        `/requests/${request.id}/attachments`,
        { method: 'POST', body },
      );
      state.setData(result);
      toast('تم رفع المستند بنجاح.');
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy('');
      if (fileRef.current) fileRef.current.value = '';
    }
  }
  async function removeFile(id: number) {
    setBusy('delete');
    try {
      await api(`/attachments/${id}`, { method: 'DELETE', body: '{}' });
      state.setData({
        request: { ...r!, attachments: r!.attachments?.filter((f) => f.id !== id) },
      });
      toast('تم حذف المرفق.');
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy('');
    }
  }
  /** يطبّق اقتراح المساعد على الحقول، ثم ينقل الطالب لأول ما ينقصه (أو لزر الإرسال إن اكتمل كل شيء). */
  function applySuggestion(s: Suggestion) {
    const next = { ...form };
    for (const key of [
      'title',
      'category',
      'organization',
      'activity_date',
      'description',
    ] as const)
      if (s[key]) next[key] = s[key];
    setForm(next);
    setValidation('');
    const missing =
      next.title.trim().length < 5
        ? 'activity-title'
        : !next.category
          ? 'activity-category'
          : !next.activity_date
            ? 'activity-date'
            : next.organization.trim().length < 3
              ? 'activity-org'
              : next.description.trim().length < 20
                ? 'activity-description'
                : !r?.attachments?.length
                  ? 'doc-upload'
                  : 'review-submit';
    toast(
      missing === 'review-submit'
        ? 'تمت التعبئة. راجع البيانات ثم اضغط «مراجعة وإرسال الطلب».'
        : 'تمت التعبئة. أكمل الحقل التالي ثم راجع بياناتك.',
    );
    setTimeout(() => {
      const el = document.getElementById(missing);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.focus({ preventScroll: true });
    }, 60);
  }
  function preSubmit() {
    if (
      form.title.trim().length < 5 ||
      !form.category ||
      form.organization.trim().length < 3 ||
      !form.activity_date ||
      form.description.trim().length < 20
    ) {
      setValidation('استكمل جميع الحقول، واكتب وصفًا لا يقل عن ٢٠ حرفًا.');
      document.getElementById('activity-title')?.focus();
      return;
    }
    if (!r?.attachments?.length) {
      setValidation('يرجى إرفاق مستند مؤيد واحد على الأقل قبل التقديم.');
      return;
    }
    if (r.gallery?.consent && !r.gallery.imageId) {
      setValidation('أضف صورة المعرض أو ألغِ خيار النشر قبل التقديم.');
      return;
    }
    setConfirm(true);
  }
  async function submit() {
    if (!declared) return;
    setBusy('submit');
    try {
      const request = await saveDraft(false);
      const result = await api<{ request: ActivityRequest }>(`/requests/${request.id}/submit`, {
        method: 'POST',
        body: '{}',
      });
      state.setData(result);
      setConfirm(false);
      toast('تم استلام طلبك. نزّل الاستمارة وقدمها للمكتب المختص.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy('');
    }
  }
  if (state.loading) return <Loading />;
  if (state.error) return <ErrorPanel message={state.error} retry={state.reload} />;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">مشاركتك تستحق التوثيق</span>
          <h1>
            {editable
              ? r?.status === 'revision'
                ? 'استكمال بيانات النشاط'
                : 'تسجيل النشاط'
              : 'تفاصيل نشاطي'}
          </h1>
          <p>
            {editable
              ? 'أدخل بيانات مشاركتك بدقة، وراجعها قبل إرسال الطلب.'
              : 'تابع حالة طلبك وملاحظات الموظف المختص.'}
          </p>
        </div>
        {r && <Badge status={r.status} />}
      </div>
      {r?.review_note && (
        <div className={`review-note ${r.status === 'approved' ? 'success' : ''}`}>
          <ClipboardCheck size={21} />
          <div>
            <strong>ملاحظة الموظف المختص</strong>
            <p>{r.review_note}</p>
          </div>
        </div>
      )}
      {r && !editable && (
        <div className={`submission-banner ${r.status === 'approved' ? 'approved' : ''}`}>
          <span>{r.status === 'approved' ? <CheckCircle2 size={28} /> : <Clock3 size={28} />}</span>
          <div>
            <h3>
              {r.status === 'approved'
                ? 'تم اعتماد نشاطك — ٤٠ / ٤٠ درجة'
                : r.status === 'pending'
                  ? 'تم استلام طلبك بنجاح'
                  : 'اطّلع على نتيجة مراجعة طلبك'}
            </h3>
            <p>
              {r.status === 'pending'
                ? 'الخطوة التالية: اطبع الاستمارة وقدّمها للمكتب المختص. الدرجة تُضاف بعد الاعتماد.'
                : `رقم الطلب ${requestNumber(r.id)}`}
            </p>
          </div>
          {r.version > 0 && (
            <a
              className="button secondary"
              href={`/api/requests/${r.id}/form`}
              target={isBrowserPreview ? '_blank' : undefined}
              rel="noopener"
            >
              <Download size={17} />
              {isBrowserPreview ? 'عرض وطباعة الاستمارة' : 'تنزيل الاستمارة'}
            </a>
          )}
        </div>
      )}
      <div className="form-layout">
        <form className="card activity-form" onSubmit={save}>
          <div className="form-section-heading">
            <span>٠١</span>
            <div>
              <h2>بيانات الطالب</h2>
              <p>بيانات مرتبطة بحسابك ولا يمكن تعديلها من الطلب.</p>
            </div>
            <ShieldCheck size={20} />
          </div>
          <div className="student-identity">
            <div>
              <small>اسم الطالب</small>
              <strong>{user.name}</strong>
            </div>
            <div>
              <small>
                {String(user.student_id).startsWith('ق.م') ? 'الرقم القومي' : 'الرقم الجامعي'}
              </small>
              <strong dir="ltr">{user.student_id}</strong>
            </div>
            <div>
              <small>الفرقة الدراسية</small>
              <strong>{user.year}</strong>
            </div>
          </div>
          {editable && (
            <FormAssistant types={session.faculty.activityTypes} onApply={applySuggestion} />
          )}
          <div className="form-section-heading">
            <span>٠٢</span>
            <div>
              <h2>بيانات النشاط</h2>
              <p>عرّفنا بمشاركتك والجهة المنظمة لها.</p>
            </div>
          </div>
          <fieldset disabled={!editable || !!busy}>
            <label htmlFor="activity-title">
              اسم النشاط <span className="required">*</span>
              <input
                id="activity-title"
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="مثال: المشاركة في حملة تطوعية"
                maxLength={120}
              />
            </label>
            <div className="form-row">
              <label>
                نوع النشاط <span className="required">*</span>
                <select
                  id="activity-category"
                  value={form.category}
                  onChange={(e) => set('category', e.target.value)}
                >
                  <option value="">اختر نوع النشاط</option>
                  {session.faculty.activityTypes.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label>
                تاريخ المشاركة <span className="required">*</span>
                <input
                  id="activity-date"
                  type="date"
                  dir="rtl"
                  max={new Date().toISOString().slice(0, 10)}
                  value={form.activity_date}
                  onChange={(e) => set('activity_date', e.target.value)}
                />
              </label>
            </div>
            <label>
              الجهة المنظمة <span className="required">*</span>
              <input
                id="activity-org"
                value={form.organization}
                onChange={(e) => set('organization', e.target.value)}
                placeholder="اسم الجهة أو الفريق المنظم للنشاط"
                maxLength={160}
              />
            </label>
            <label>
              وصف مشاركتك <span className="required">*</span>
              <textarea
                id="activity-description"
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="اكتب نبذة عن النشاط ودورك فيه…"
                rows={4}
                maxLength={2000}
              />
              <span className="field-hint">
                ٢٠ حرفًا على الأقل <span>{number(form.description.length)} / ٢٠٠٠</span>
              </span>
            </label>
          </fieldset>
          <div className="form-section-heading">
            <span>٠٣</span>
            <div>
              <h2>المستندات المؤيدة</h2>
              <p>أرفق شهادة المشاركة أو مستندًا يوضح النشاط.</p>
            </div>
            <Paperclip size={19} />
          </div>
          {editable && (
            <>
              <input
                className="sr-only"
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => {
                  if (e.target.files?.[0]) upload(e.target.files[0]);
                }}
              />
              <button
                id="doc-upload"
                className="upload-zone"
                type="button"
                disabled={!!busy || (r?.attachments?.length ?? 0) >= 5}
                onClick={() => fileRef.current?.click()}
              >
                <span className="upload-icon">
                  {busy === 'upload' ? (
                    <LoaderCircle className="spin" />
                  ) : (
                    <UploadCloud size={28} />
                  )}
                </span>
                <strong>{busy === 'upload' ? 'جارٍ رفع المستند…' : 'اضغط لاختيار المستند'}</strong>
                <span>PDF أو JPG أو PNG · حتى ٨ ميجابايت للملف · ٥ ملفات كحد أقصى</span>
              </button>
            </>
          )}
          <Attachments files={r?.attachments} canDelete={editable && !busy} onDelete={removeFile} />
          {!editable && !r?.attachments?.length && (
            <p className="muted">لا توجد مرفقات في هذا السجل التجريبي.</p>
          )}
          {(editable || r?.gallery?.consent) && (
            <GalleryOptIn
              request={r}
              ensureRequest={ensureRequest}
              onChange={(request) => state.setData({ request })}
              disabled={!editable}
            />
          )}
          {validation && (
            <div className="form-error" role="alert">
              {validation}
            </div>
          )}
          {editable && (
            <div className="form-actions">
              <button
                id="review-submit"
                type="button"
                className="button primary"
                disabled={!!busy}
                onClick={preSubmit}
              >
                <Send size={17} />
                {busy === 'submit' ? 'جارٍ الإرسال…' : 'مراجعة وإرسال الطلب'}
              </button>
              <button className="button secondary" disabled={!!busy}>
                <Save size={17} />
                {busy === 'save' ? 'جارٍ الحفظ…' : 'حفظ كمسودة'}
              </button>
            </div>
          )}
        </form>
        <aside className="form-aside">
          <div className="card tips-card">
            <span className="tips-icon">
              <CircleHelp size={24} />
            </span>
            <h3>قبل التقديم</h3>
            <ul>
              <li>تأكد من صحة بيانات النشاط وتاريخ المشاركة.</li>
              <li>ارفع مستندًا واضحًا وقابلًا للقراءة.</li>
              <li>يمكنك حفظ المسودة واستكمالها لاحقًا.</li>
              <li>بعد الإرسال، لا يمكن تعديل الطلب إلا إذا أُعيد للاستكمال.</li>
            </ul>
            <Link to="/guide" className="text-button">
              قراءة الإرشادات <ArrowUpLeft size={15} />
            </Link>
          </div>
          <div className="office-note">
            <ClipboardCheck size={23} />
            <h4>التسليم الورقي خطوة أساسية</h4>
            <p>{session.faculty.office}.</p>
            <small>الاستمارة تثبت تقديم الطلب، ولا تمثل اعتمادًا للنشاط.</small>
          </div>
          {r?.events && r.events.length > 0 && (
            <div className="card timeline-card">
              <h3>سجل الطلب</h3>
              <EventTimeline events={r.events} />
            </div>
          )}
        </aside>
      </div>
      {confirmPresence.render && (
        <div
          className="modal-backdrop"
          data-state={confirmPresence.state}
          onClick={() => !busy && setConfirm(false)}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="modal-icon">
              <Send size={27} />
            </span>
            <h2 id="confirm-title">جاهز لتقديم نشاطك؟</h2>
            <p>
              سيتم إرسال البيانات والمرفقات للمراجعة، وستتمكن من تنزيل الاستمارة وطباعتها. لن تتمكن
              من التعديل إلا عند إعادة الطلب للاستكمال.
            </p>
            <div className="confirmation-summary">
              <strong>{form.title}</strong>
              <span>
                {form.organization} · {form.activity_date}
              </span>
            </div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={declared}
                onChange={(e) => setDeclared(e.target.checked)}
              />
              <span>
                أقر بصحة البيانات والمستندات، وأعلم أن الاعتماد يتطلب تسليم الاستمارة ومراجعتها.
              </span>
            </label>
            <div className="form-actions">
              <button className="button primary" disabled={!declared || !!busy} onClick={submit}>
                {busy ? 'جارٍ التقديم…' : 'تأكيد التقديم'}
                <Check size={17} />
              </button>
              <button
                className="button secondary"
                disabled={!!busy}
                onClick={() => setConfirm(false)}
              >
                العودة للمراجعة
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
const eventLabels: Record<string, string> = {
  submitted: 'تقديم الطلب',
  approved: 'اعتماد النشاط',
  revision: 'طلب استكمال',
  rejected: 'عدم اعتماد',
  cancelled: 'إلغاء الطلب',
  reopened: 'إعادة فتح الطلب',
  revoked: 'سحب الاعتماد',
  gallery_hidden: 'إخفاء من المعرض العام',
  gallery_shown: 'إظهار في المعرض العام',
  document_read: 'قراءة آلية لمستند',
};
export function EventTimeline({ events }: { events: NonNullable<ActivityRequest['events']> }) {
  return (
    <div className="event-timeline">
      {events.map((event) => (
        <div key={event.id}>
          <i />
          <strong>{eventLabels[event.action] || event.action}</strong>
          <small>
            {date(event.created_at)} · {event.actor_name}
          </small>
          {event.note && <p>{event.note}</p>}
        </div>
      ))}
    </div>
  );
}
export function DocumentsPage() {
  const { data, loading, error, reload } = useData<{ request: ActivityRequest | null }>(
    '/requests/mine',
  );
  const r = data?.request;
  if (loading) return <Loading />;
  if (error) return <ErrorPanel message={error} retry={reload} />;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">كل أوراقك في مكان واحد</span>
          <h1>المستندات والاستمارة</h1>
          <p>نزّل استمارة نشاطك، وراجع المستندات المرفقة بطلبك.</p>
        </div>
        <div className="heading-emblem">
          <FolderOpen />
        </div>
      </div>
      {r?.version ? (
        <section className="card document-form-card">
          <span className="document-big-icon">
            <FileCheck2 size={39} />
          </span>
          <div>
            <span className="section-kicker">جاهزة للطباعة</span>
            <h2>استمارة النشاط الطلابي</h2>
            <p>{r.title}</p>
            <small>
              {requestNumber(r.id)} · الإصدار {number(r.version)} · {date(r.submitted_at)}
            </small>
          </div>
          <a
            className="button primary"
            href={`/api/requests/${r.id}/form`}
            target={isBrowserPreview ? '_blank' : undefined}
            rel="noopener"
          >
            <Download size={18} />
            {isBrowserPreview ? 'عرض وطباعة الاستمارة' : 'تنزيل PDF'}
          </a>
        </section>
      ) : (
        <section className="card">
          <Empty
            icon={<FileText size={34} />}
            title="تتاح الاستمارة بعد تقديم الطلب"
            text="استكمل بيانات النشاط وارفع المستندات، ثم أرسل الطلب لاستخراج الاستمارة."
            action={
              <Link className="button secondary" to="/activity">
                الانتقال إلى نشاطي <ArrowLeft size={17} />
              </Link>
            }
          />
        </section>
      )}
      <section className="card attachments-card">
        <div className="card-heading">
          <div>
            <h2>مرفقات الطلب</h2>
            <p>
              {r?.attachments?.length
                ? `${number(r.attachments.length)} مستند مرفق`
                : 'لا توجد مستندات مرفقة حاليًا'}
            </p>
          </div>
          <Paperclip size={20} />
        </div>
        <Attachments files={r?.attachments} />
        {!r?.attachments?.length && (
          <div className="inline-empty">
            <FileUp size={28} />
            <p>المستندات التي ترفعها مع النشاط ستظهر هنا.</p>
          </div>
        )}
      </section>
      <div className="info-box">
        <ShieldCheck size={21} />
        <p>الملفات خاصة بطلبك، ولا يمكن الوصول إليها إلا من حسابك أو حساب موظف مخوّل بالمراجعة.</p>
      </div>
    </>
  );
}
