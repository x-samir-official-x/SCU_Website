import { isBrowserPreview } from './preview-bootstrap';
import { CertificateReader } from './CertificateReader';
import { Avatar } from './Avatar';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpLeft,
  BarChart3,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Download,
  Eye,
  FileSearch,
  FileText,
  GraduationCap,
  Inbox,
  ListFilter,
  LockKeyhole,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCog,
  Users,
  X,
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
import { Attachments, EventTimeline, Stat } from './Student';
import type { ActivityRequest, Staff, Status } from './types';

function RequestsTable({ requests }: { requests: ActivityRequest[] }) {
  return (
    <div className="table-scroll">
      <table className="requests-table">
        <thead>
          <tr>
            <th>الطالب</th>
            <th>النشاط</th>
            <th>تاريخ التقديم</th>
            <th>الحالة</th>
            <th>
              <span className="sr-only">التفاصيل</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id}>
              <td>
                <div className="table-student">
                  <span className="avatar">{r.student_name?.[0]}</span>
                  <div>
                    <strong>{r.student_name}</strong>
                    <small dir="ltr">{r.student_id}</small>
                  </div>
                </div>
              </td>
              <td>
                <strong className="table-title">{r.title}</strong>
                <small className="table-subtitle">{r.category}</small>
              </td>
              <td className="table-date">{date(r.submitted_at)}</td>
              <td>
                <Badge status={r.status} />
              </td>
              <td>
                <Link
                  className="table-open"
                  to={`/requests/${r.id}`}
                  aria-label={`مراجعة طلب ${r.student_name}`}
                >
                  <ArrowUpLeft size={18} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function StaffDashboard() {
  const { session } = useSession();
  const { data, loading, error, reload } = useData<{
    counts: { status: Status; count: number }[];
    students: { count: number };
    recent: ActivityRequest[];
  }>('/staff/overview');
  if (loading) return <Loading />;
  if (error) return <ErrorPanel message={error} retry={reload} />;
  const count = (status: Status) => data?.counts.find((c) => c.status === status)?.count || 0;
  const total =
    data?.counts.filter((c) => c.status !== 'draft').reduce((sum, c) => sum + c.count, 0) || 0;
  const distribution: { label: string; value: number; color: string }[] = [
    { label: 'قيد المراجعة', value: count('pending'), color: 'sand' },
    { label: 'معتمد', value: count('approved'), color: 'green' },
    { label: 'مطلوب استكمال', value: count('revision'), color: 'blue' },
    { label: 'غير معتمد أو ملغى', value: count('rejected') + count('cancelled'), color: 'red' },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">
            <span className="live-dot" />
            إدارة الأنشطة الطلابية
          </span>
          <h1>أهلًا، {session.user!.name.split(' ')[0]}</h1>
          <p>نظرة واضحة على الطلبات، وخطوات أسرع للمراجعة.</p>
        </div>
        <Link to="/requests" className="button primary">
          مراجعة الطلبات <ArrowLeft size={18} />
        </Link>
      </div>
      <section className="staff-welcome">
        <div>
          <span className="hero-label">
            <ShieldCheck size={15} />
            كلية التجارة · جامعة قناة السويس
          </span>
          <h2>إدارة طلبات النشاط الطلابي</h2>
          <p>راجع البيانات، وطابق الاستمارة الورقية، ثم اعتمد النشاط بخطوات موثقة.</p>
          <Link to="/requests?status=pending">
            {number(count('pending'))} طلب بانتظار المراجعة <ArrowLeft size={17} />
          </Link>
        </div>
        <div className="staff-welcome-icon">
          <ClipboardCheck size={78} strokeWidth={1} />
          <span>
            <Check size={18} />
          </span>
        </div>
      </section>
      <section className="stats-grid admin-stats">
        <Stat
          icon={<FileText />}
          label="إجمالي الطلبات المقدمة"
          value={number(total)}
          detail={session.faculty.period}
        />
        <Stat
          icon={<Clock3 />}
          label="بانتظار المراجعة"
          value={number(count('pending'))}
          detail="جاهزة للمطابقة والتدقيق"
          tone="sand"
        />
        <Stat
          icon={<CheckCheck />}
          label="أنشطة معتمدة"
          value={number(count('approved'))}
          detail="تم احتساب الدرجة لها"
          tone="blue"
        />
        <Stat
          icon={<Users />}
          label="حسابات الطلاب"
          value={number(data?.students.count || 0)}
          detail="الحسابات النشطة في الكلية"
          tone="purple"
        />
      </section>
      <div className="staff-dashboard-grid">
        <section className="card recent-card">
          <div className="card-heading">
            <div>
              <h2>آخر الطلبات</h2>
              <p>أحدث الطلبات والتحديثات المسجلة</p>
            </div>
            <Link to="/requests" className="text-button">
              عرض الكل <ChevronLeft size={16} />
            </Link>
          </div>
          {data?.recent.length ? (
            <RequestsTable requests={data.recent} />
          ) : (
            <Empty
              icon={<Inbox size={29} />}
              title="لا توجد طلبات مقدمة بعد"
              text="ستظهر طلبات الطلاب هنا فور إرسالها."
            />
          )}
        </section>
        <section className="card distribution-card">
          <div className="card-heading">
            <div>
              <h2>حالة الطلبات</h2>
              <p>توزيع الطلبات خلال الفترة الحالية</p>
            </div>
            <BarChart3 size={21} />
          </div>
          <div className="distribution-total">
            <strong>{number(total)}</strong>
            <span>طلب مقدم</span>
          </div>
          {distribution.map((s) => (
            <div className="distribution-row" key={s.label}>
              <div>
                <span>
                  <i className={s.color} />
                  {s.label}
                </span>
                <strong>{number(s.value)}</strong>
              </div>
              <div className="distribution-track">
                <span
                  className={s.color}
                  style={{ width: `${total ? (s.value / total) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))}
        </section>
      </div>
      <div className="info-box">
        <ShieldCheck size={22} />
        <p>
          اعتماد النشاط يضيف ٤٠ درجة كاملة. تأكد من استلام ومطابقة الاستمارة الورقية قبل الاعتماد؛
          جميع القرارات محفوظة في سجل الطلب.
        </p>
      </div>
    </>
  );
}
export function RequestList() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') || '');
  const status = params.get('status') || 'all';
  const page = Math.max(1, Number(params.get('page')) || 1);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query !== (params.get('q') || '')) {
        const next = new URLSearchParams(params);
        if (query) next.set('q', query);
        else next.delete('q');
        next.delete('page');
        setParams(next, { replace: true });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [query, params, setParams]);
  const resource = useData<{
    requests: ActivityRequest[];
    total: number;
    page: number;
    limit: number;
  }>(`/staff/requests?${params.toString()}`);
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">متابعة ومراجعة</span>
          <h1>طلبات الأنشطة</h1>
          <p>ابحث عن الطالب وراجع نشاطه ومستنداته من مكان واحد.</p>
        </div>
        <button className="button secondary" onClick={resource.reload}>
          <RefreshCw size={17} />
          تحديث
        </button>
      </div>
      <section className="card requests-card">
        <div className="filters">
          <label className="search-field">
            <Search size={19} />
            <input
              aria-label="البحث عن طالب أو نشاط"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث بالاسم أو الرقم أو النشاط…"
            />
            {query && (
              <button className="icon-button" onClick={() => setQuery('')} aria-label="مسح البحث">
                <X size={15} />
              </button>
            )}
          </label>
          <label className="filter-select">
            <ListFilter size={17} />
            <select
              aria-label="تصفية حسب الحالة"
              value={status}
              onChange={(e) => change('status', e.target.value)}
            >
              <option value="all">كل الحالات</option>
              <option value="pending">قيد المراجعة</option>
              <option value="approved">معتمد</option>
              <option value="revision">مطلوب استكمال</option>
              <option value="rejected">لم يُعتمد</option>
              <option value="cancelled">ملغى</option>
            </select>
          </label>
        </div>
        <div className="table-meta">
          <strong>{number(resource.data?.total || 0)} طلب</strong>
          <span>الرقم الجامعي هو وسيلة البحث الأساسية</span>
        </div>
        {resource.loading ? (
          <Loading compact />
        ) : resource.error ? (
          <ErrorPanel message={resource.error} retry={resource.reload} />
        ) : resource.data?.requests.length ? (
          <RequestsTable requests={resource.data.requests} />
        ) : (
          <Empty
            icon={<FileSearch size={32} />}
            title="لم نعثر على طلبات مطابقة"
            text={
              query || status !== 'all'
                ? 'جرّب تعديل كلمات البحث أو اختيار حالة مختلفة.'
                : 'ستظهر طلبات الطلاب هنا بعد تقديمها.'
            }
          />
        )}
        {resource.data && resource.data.total > 0 && (
          <div className="pagination">
            <span>
              صفحة {number(page)} من {number(Math.ceil(resource.data.total / resource.data.limit))}
            </span>
            <div>
              <button
                className="icon-button"
                disabled={page <= 1}
                onClick={() => change('page', String(page - 1))}
                aria-label="الصفحة السابقة"
              >
                <ChevronRight size={18} />
              </button>
              <span>{number(page)}</span>
              <button
                className="icon-button"
                disabled={page * resource.data.limit >= resource.data.total}
                onClick={() => change('page', String(page + 1))}
                aria-label="الصفحة التالية"
              >
                <ChevronLeft size={18} />
              </button>
            </div>
          </div>
        )}
      </section>
      <div className="privacy-note">
        <LockKeyhole size={16} />
        نتائج البحث وملفات الطلاب متاحة للمستخدمين المخولين فقط.
      </div>
    </>
  );
}
type ReviewAction = 'approve' | 'revision' | 'reject' | 'cancel' | 'reopen' | 'revoke';
export function ReviewPage() {
  const { id } = useParams();
  const { session } = useSession();
  const toast = useToast();
  const state = useData<{ request: ActivityRequest }>(`/requests/${id}`);
  const [action, setAction] = useState<ReviewAction>('approve');
  const [note, setNote] = useState('');
  const [received, setReceived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const confirmPresence = usePresence(confirm);
  const r = state.data?.request;
  useModalFocus(confirm, () => {
    if (!busy) setConfirm(false);
  });
  useEffect(() => {
    if (r) {
      setAction(
        r.status === 'approved'
          ? 'revoke'
          : ['rejected', 'cancelled'].includes(r.status)
            ? 'reopen'
            : r.status === 'revision'
              ? 'revision'
              : 'approve',
      );
      setNote('');
      setReceived(false);
    }
  }, [r?.id, r?.status]);
  if (state.loading) return <Loading />;
  if (state.error) return <ErrorPanel message={state.error} retry={state.reload} />;
  if (!r) return null;
  const canReview = ['pending', 'revision'].includes(r.status);
  const isAdmin = session.user!.role === 'admin';
  const canReopen = isAdmin && ['approved', 'rejected', 'cancelled'].includes(r.status);
  const labels: Record<ReviewAction, string> = {
    approve: 'اعتماد النشاط وإضافة ٤٠ درجة',
    revision: 'إعادة الطلب للاستكمال',
    reject: 'عدم اعتماد النشاط',
    cancel: 'إلغاء الطلب',
    reopen: 'إعادة فتح الطلب للاستكمال',
    revoke: 'سحب الاعتماد وإعادة الطلب للاستكمال',
  };
  async function review() {
    setBusy(true);
    try {
      const data = await api<{ request: ActivityRequest }>(`/staff/requests/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ action, note, physicalReceived: received }),
      });
      state.setData(data);
      setConfirm(false);
      toast('تم حفظ قرار المراجعة وتحديث حالة الطالب.');
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link className="back-link" to="/requests">
        <ChevronRight size={17} />
        العودة إلى الطلبات
      </Link>
      <div className="page-heading">
        <div>
          <span className="section-kicker" dir="ltr">
            {requestNumber(r.id)}
          </span>
          <h1>مراجعة طلب النشاط</h1>
          <p>
            قُدم في {date(r.submitted_at)} · إصدار الاستمارة {number(r.version)}
          </p>
        </div>
        <Badge status={r.status} />
      </div>
      <div className="review-layout">
        <div className="review-main">
          <section className="card review-student">
            <div className="review-student-header">
              <Avatar
                userId={r.user_id}
                version={r.student_avatar}
                name={r.student_name ?? ''}
                className="large"
              />
              <div>
                <span className="section-kicker">بيانات الطالب</span>
                <h2>{r.student_name}</h2>
              </div>
              <GraduationCap size={28} />
            </div>
            <div className="student-identity">
              <div>
                <small>الرقم الجامعي</small>
                <strong dir="ltr">{r.student_id}</strong>
              </div>
              <div>
                <small>الفرقة الدراسية</small>
                <strong>{r.year}</strong>
              </div>
              <div>
                <small>رقم الموبايل</small>
                <strong dir="ltr">{r.student_phone || 'غير مسجل'}</strong>
              </div>
              <div>
                <small>الكلية</small>
                <strong>{session.faculty.faculty}</strong>
              </div>
            </div>
          </section>
          <section className="card review-details">
            <div className="card-heading">
              <h2>تفاصيل النشاط</h2>
              <LeafIcon />
            </div>
            <h3 className="review-activity-title">{r.title}</h3>
            <div className="detail-grid">
              <div>
                <small>نوع النشاط</small>
                <strong>{r.category}</strong>
              </div>
              <div>
                <small>الجهة المنظمة</small>
                <strong>{r.organization}</strong>
              </div>
              <div>
                <small>تاريخ المشاركة</small>
                <strong>{date(r.activity_date)}</strong>
              </div>
              <div>
                <small>حالة الاستحقاق</small>
                <strong>
                  <bdi dir="ltr">{r.status === 'approved' ? '٤٠ / ٤٠' : '٠ / ٤٠'}</bdi> درجة
                </strong>
              </div>
            </div>
            <div className="description-block">
              <small>وصف مشاركة الطالب</small>
              <p>{r.description}</p>
            </div>
          </section>
          <section className="card attachments-card">
            <div className="card-heading">
              <div>
                <h2>الاستمارة والمرفقات</h2>
                <p>طابق المستندات الإلكترونية بالنسخ المقدمة.</p>
              </div>
            </div>
            {r.version > 0 && (
              <a
                className="form-download-row"
                href={`/api/requests/${r.id}/form`}
                target={isBrowserPreview ? '_blank' : undefined}
                rel="noopener"
              >
                <FileText size={24} />
                <div>
                  <strong>استمارة النشاط الطلابي</strong>
                  <small>PDF · الإصدار {number(r.version)}</small>
                </div>
                <Download size={19} />
              </a>
            )}
            <Attachments files={r.attachments} />
            {!isBrowserPreview && <CertificateReader files={r.attachments ?? []} />}
            {!r.attachments?.length && (
              <p className="muted small-text">هذا طلب توضيحي ببيانات تجريبية دون مرفقات.</p>
            )}
          </section>
          {r.gallery?.consent && (
            <section className="card gallery-staff-card">
              <div className="card-heading">
                <div>
                  <h2>المعرض العام</h2>
                  <p>
                    وافق الطالب على نشر صورة النشاط بدون اسمه.{' '}
                    {r.gallery.published
                      ? 'الصورة معروضة الآن للزوار.'
                      : r.gallery.hidden
                        ? 'تم إخفاؤها من المعرض.'
                        : 'غير معروضة حاليًا (حسب حالة الطلب).'}{' '}
                    النشر لا يعني اعتماد النشاط ولا يمنح درجة.
                  </p>
                </div>
              </div>
              {r.gallery.imageId && (
                <img
                  className="gallery-staff-image"
                  src={`/api/attachments/${r.gallery.imageId}`}
                  alt="صورة المعرض المقترحة"
                />
              )}
              <button
                className="button secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const result = await api<{ request: ActivityRequest }>(
                      `/staff/requests/${r.id}/gallery-hidden`,
                      { method: 'POST', body: JSON.stringify({ hidden: !r.gallery!.hidden }) },
                    );
                    state.setData(result);
                    toast(
                      result.request.gallery?.hidden
                        ? 'تم إخفاء النشاط من المعرض.'
                        : 'تم إظهار النشاط في المعرض.',
                    );
                  } catch (e) {
                    toast((e as Error).message, true);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {r.gallery.hidden ? 'إظهار في المعرض' : 'إخفاء من المعرض'}
              </button>
            </section>
          )}
          <section className="card timeline-card">
            <h2>سجل الإجراءات</h2>
            <EventTimeline events={r.events || []} />
          </section>
        </div>
        <aside className="review-aside">
          {canReview || canReopen ? (
            <section className="card decision-card">
              <span className="decision-icon">
                <ClipboardCheck size={25} />
              </span>
              <h2>قرار المراجعة</h2>
              <p>راجع البيانات والمستندات قبل اتخاذ القرار.</p>
              {canReview ? (
                <div className="decision-options">
                  {(r.status === 'pending'
                    ? ['approve', 'revision', 'reject', 'cancel']
                    : ['revision', 'reject', 'cancel']
                  ).map((a) => (
                    <label className={`decision-option ${action === a ? 'selected' : ''}`} key={a}>
                      <input
                        type="radio"
                        name="review-action"
                        value={a}
                        checked={action === a}
                        onChange={() => setAction(a as ReviewAction)}
                      />
                      <span>
                        {a === 'approve'
                          ? 'اعتماد النشاط'
                          : a === 'revision'
                            ? 'طلب استكمال'
                            : a === 'reject'
                              ? 'عدم الاعتماد'
                              : 'إلغاء الطلب'}
                      </span>
                      {a === 'approve' && <small>٤٠ درجة</small>}
                    </label>
                  ))}
                </div>
              ) : (
                <div className="review-note">
                  <ShieldCheck size={18} />
                  <p>
                    {r.status === 'approved'
                      ? 'سحب الاعتماد يُلغي الدرجة المعتمدة ويعيد الطلب للطالب.'
                      : 'إعادة الفتح تتيح للطالب تعديل الطلب وإرساله مجددًا.'}
                  </p>
                </div>
              )}
              <label>
                ملاحظات المراجعة {action !== 'approve' && <span className="required">*</span>}
                <textarea
                  rows={4}
                  value={note}
                  maxLength={1000}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={
                    action === 'approve'
                      ? 'ملاحظة اختيارية للطالب…'
                      : 'اكتب سبب القرار بوضوح للطالب…'
                  }
                />
              </label>
              {action === 'approve' && (
                <label className="checkbox-label physical-check">
                  <input
                    type="checkbox"
                    checked={received}
                    onChange={(e) => setReceived(e.target.checked)}
                  />
                  <span>أؤكد استلام الاستمارة الورقية ومطابقتها بالبيانات والمستندات.</span>
                </label>
              )}
              <button
                className={`button full ${action === 'approve' ? 'primary' : 'secondary'}`}
                disabled={busy || (action === 'approve' ? !received : note.trim().length < 5)}
                onClick={() => setConfirm(true)}
              >
                {labels[action]}
                {action === 'approve' && <Check size={17} />}
              </button>
              <span className="decision-footer">
                <ShieldCheck size={14} />
                يُحفظ القرار باسم حسابك وتاريخه.
              </span>
            </section>
          ) : (
            <section className="card reviewed-card">
              <span>
                <CheckCircle2 size={30} />
              </span>
              <h2>تمت مراجعة الطلب</h2>
              <Badge status={r.status} />
              <p>
                {r.status === 'approved'
                  ? 'تم احتساب ٤٠ درجة للطالب.'
                  : 'يمكن للمسؤول الرئيسي إعادة فتح الطلب عند الحاجة.'}
              </p>
              {r.review_note && <blockquote>{r.review_note}</blockquote>}
            </section>
          )}
          <div className="office-note">
            <ShieldCheck size={23} />
            <h4>مراجعة مسؤولة، وسجل موثق</h4>
            <p>
              الدرجة لا تُضاف إلا بعد الاعتماد. سحب الاعتماد وإعادة فتح الطلبات متاحان للمسؤول
              الرئيسي فقط.
            </p>
          </div>
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
            aria-labelledby="review-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="modal-icon">
              <ClipboardCheck size={28} />
            </span>
            <h2 id="review-confirm-title">تأكيد قرار المراجعة</h2>
            <p>
              {labels[action]} للطالب <strong>{r.student_name}</strong>.
            </p>
            {action === 'approve' && <p>سيظهر النشاط معتمدًا للطالب وتُضاف ٤٠ درجة كاملة.</p>}
            {action === 'revoke' && (
              <p className="danger-text">ستُسحب الدرجة المعتمدة ويُعاد الطلب للاستكمال.</p>
            )}
            {note && <blockquote>{note}</blockquote>}
            <div className="form-actions">
              <button className="button primary" disabled={busy} onClick={review}>
                {busy ? 'جارٍ الحفظ…' : 'تأكيد القرار'}
                <Check size={17} />
              </button>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => setConfirm(false)}
              >
                رجوع
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
function LeafIcon() {
  return (
    <span className="stat-icon green small">
      <ClipboardCheck size={19} />
    </span>
  );
}
export function StaffPage() {
  const { session } = useSession();
  const toast = useToast();
  const state = useData<{ staff: Staff[] }>('/admin/staff');
  const [show, setShow] = useState(false);
  const showPresence = usePresence(show);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [toggle, setToggle] = useState<Staff | null>(null);
  useModalFocus(show || !!toggle, () => {
    if (!busy) {
      setShow(false);
      setToggle(null);
    }
  });
  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/admin/staff', {
        method: 'POST',
        body: JSON.stringify({ ...form, role: 'moderator' }),
      });
      setShow(false);
      setForm({ name: '', email: '', password: '' });
      state.reload();
      toast('تم إنشاء حساب الموظف. لديه صلاحيات المراجعة فقط.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function toggleActive() {
    if (!toggle) return;
    setBusy(true);
    try {
      await api(`/admin/staff/${toggle.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !toggle.active }),
      });
      state.reload();
      toast(toggle.active ? 'تم تعطيل الحساب وإنهاء جلساته.' : 'تم تفعيل الحساب.');
      setToggle(null);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">صلاحيات المسؤول الرئيسي</span>
          <h1>إدارة الموظفين</h1>
          <p>أضف الموظفين المخولين بالمراجعة، وتحكّم في تفعيل حساباتهم.</p>
        </div>
        <button className="button primary" onClick={() => setShow(true)}>
          <Plus size={18} />
          إضافة موظف
        </button>
      </div>
      <div className="info-box">
        <ShieldCheck size={22} />
        <p>
          الموظفون المضافون يملكون صلاحيات مراجعة الأنشطة فقط. إنشاء الحسابات وإدارتها متاحان
          للمسؤول الرئيسي.
        </p>
      </div>
      <section className="card staff-card">
        {state.loading ? (
          <Loading compact />
        ) : state.error ? (
          <ErrorPanel message={state.error} retry={state.reload} />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>الموظف</th>
                  <th>الصلاحية</th>
                  <th>الحالة</th>
                  <th>تاريخ الإضافة</th>
                  <th>إدارة الحساب</th>
                </tr>
              </thead>
              <tbody>
                {state.data?.staff.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="table-student">
                        <span className="avatar">{u.name[0]}</span>
                        <div>
                          <strong>{u.name}</strong>
                          <small dir="ltr">{u.email}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`role-badge ${u.role === 'admin' ? 'main' : ''}`}>
                        {u.role === 'admin' ? <ShieldCheck size={14} /> : <UserCog size={14} />}
                        {u.role === 'admin' ? 'مسؤول رئيسي' : 'موظف مراجعة'}
                      </span>
                    </td>
                    <td>
                      <span className={`account-status ${u.active ? 'enabled' : ''}`}>
                        <i />
                        {u.active ? 'نشط' : 'معطّل'}
                      </span>
                    </td>
                    <td className="table-date">{date(u.created_at)}</td>
                    <td>
                      {u.id === session.user!.id ? (
                        <small className="muted">حسابك الحالي</small>
                      ) : (
                        <button
                          className={`button tiny ${u.active ? 'secondary' : 'primary'}`}
                          onClick={() => setToggle(u)}
                        >
                          {u.active ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {showPresence.render && (
        <div
          className="modal-backdrop"
          data-state={showPresence.state}
          onClick={() => !busy && setShow(false)}
        >
          <form
            className="modal"
            onSubmit={create}
            role="dialog"
            aria-modal="true"
            aria-labelledby="staff-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <span className="modal-icon">
                <UserCog size={27} />
              </span>
              <button
                className="icon-button"
                type="button"
                aria-label="إغلاق"
                onClick={() => setShow(false)}
              >
                <X size={19} />
              </button>
            </div>
            <h2 id="staff-modal-title">إضافة موظف جديد</h2>
            <p>سيتمكن الحساب من مراجعة الطلبات دون إدارة الموظفين.</p>
            <label>
              الاسم الكامل
              <input
                required
                minLength={3}
                maxLength={80}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="اسم الموظف"
              />
            </label>
            <label>
              البريد الإلكتروني
              <input
                required
                type="email"
                dir="ltr"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="staff@example.edu"
                autoComplete="off"
              />
            </label>
            <label>
              كلمة المرور
              <input
                required
                type="password"
                dir="ltr"
                minLength={12}
                maxLength={128}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="١٢ حرفًا على الأقل"
                autoComplete="new-password"
              />
              <span className="field-hint">تُسلّم للموظف عبر وسيلة آمنة.</span>
            </label>
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <div className="form-actions">
              <button className="button primary" disabled={busy}>
                {busy ? 'جارٍ إنشاء الحساب…' : 'إنشاء الحساب'}
                <Plus size={17} />
              </button>
              <button
                className="button secondary"
                type="button"
                disabled={busy}
                onClick={() => setShow(false)}
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}
      {toggle && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="toggle-title">
            <h2 id="toggle-title">{toggle.active ? 'تعطيل' : 'تفعيل'} حساب الموظف؟</h2>
            <p>{toggle.name}</p>
            <p>
              {toggle.active
                ? 'سيفقد الموظف إمكانية الدخول، وستُنهى جلساته الحالية. تظل إجراءات المراجعة السابقة محفوظة.'
                : 'سيتمكن الموظف من تسجيل الدخول ومراجعة الطلبات من جديد.'}
            </p>
            <div className="form-actions">
              <button className="button primary" disabled={busy} onClick={toggleActive}>
                {busy ? 'جارٍ الحفظ…' : 'تأكيد'}
              </button>
              <button className="button secondary" disabled={busy} onClick={() => setToggle(null)}>
                إلغاء
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
