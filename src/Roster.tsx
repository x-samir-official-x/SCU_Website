import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Check, Copy, Download, KeyRound, Search, ShieldCheck, Upload, X } from 'lucide-react';
import {
  api,
  Empty,
  ErrorPanel,
  Loading,
  useData,
  useModalFocus,
  useSession,
  useToast,
} from './lib';
import { parseRosterCsv, ROSTER_TEMPLATE, type RosterRow } from './roster';

interface RosterStudent {
  id: number;
  name: string;
  year: string | null;
  studentId: string | null;
  nationalLast4: string;
  state: 'none' | 'temp' | 'expired' | 'staff' | 'active' | 'disabled';
}
interface RosterData {
  total: number;
  activated: number;
  tempHours: number;
  students: RosterStudent[];
}
interface Issued {
  name: string;
  temporaryPassword: string;
  expiresAt: string;
  hours: number;
}

const STATES: Record<RosterStudent['state'], { label: string; tone: string; hint: string }> = {
  none: { label: 'لم يُفعَّل', tone: 'idle', hint: 'لم يثبت هويته بعد.' },
  temp: { label: 'كلمة مؤقتة', tone: 'wait', hint: 'لديه كلمة مؤقتة لم يغيّرها بعد.' },
  expired: { label: 'انتهت المهلة', tone: 'wait', hint: 'يمكنه إثبات هويته من جديد بنفسه.' },
  staff: { label: 'يحتاج موظفًا', tone: 'alert', hint: 'تكرر انتهاء المهلة ٣ مرات.' },
  active: { label: 'مفعّل', tone: 'ok', hint: 'اختار كلمة مروره بنفسه.' },
  disabled: { label: 'موقوف', tone: 'alert', hint: 'الحساب موقوف.' },
};

const CHUNK = 250;

/** سجل الطلاب: بحث وإصدار كلمة مؤقتة (كل الموظفين) واستيراد الملف (المسؤول الرئيسي). */
export function RosterPage() {
  const { session } = useSession();
  const toast = useToast();
  const isAdmin = session.user?.role === 'admin';
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const state = useData<RosterData>(`/staff/roster?q=${encodeURIComponent(term)}`);
  const [target, setTarget] = useState<RosterStudent | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const close = () => {
    if (!busy) {
      setTarget(null);
      setIssued(null);
      setCopied(false);
    }
  };
  useModalFocus(!!target, close);
  useEffect(() => {
    const id = window.setTimeout(() => setTerm(q.trim()), 300);
    return () => window.clearTimeout(id);
  }, [q]);

  async function issue() {
    if (!target) return;
    setBusy(true);
    try {
      setIssued(
        await api(`/staff/roster/${target.id}/temp-password`, { method: 'POST', body: '{}' }),
      );
      state.reload();
    } catch (e) {
      toast((e as Error).message, true);
      setTarget(null);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.temporaryPassword);
    } catch {
      const area = document.createElement('textarea');
      area.value = issued.temporaryPassword;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">خدمة الطلاب</span>
          <h1>سجل الطلاب</h1>
          <p>ابحث عن طالب لإصدار كلمة مرور مؤقتة له إذا نسيها أو تكرر انتهاء مهلته.</p>
        </div>
      </div>
      {isAdmin && <RosterImport onDone={state.reload} />}
      <section className="card roster-card">
        <form
          className="roster-search"
          role="search"
          onSubmit={(e: FormEvent) => e.preventDefault()}
        >
          <label>
            <span className="sr-only">بحث في سجل الطلاب</span>
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="الاسم، أو الرقم الجامعي، أو الرقم القومي كاملًا"
              maxLength={60}
            />
          </label>
          {state.data && (
            <small className="muted">
              {state.data.activated.toLocaleString('ar-EG')} مفعّل من{' '}
              {state.data.total.toLocaleString('ar-EG')} في السجل
            </small>
          )}
        </form>
        {state.loading && !state.data ? (
          <Loading compact />
        ) : state.error ? (
          <ErrorPanel message={state.error} retry={state.reload} />
        ) : !state.data?.students.length ? (
          <Empty
            icon={<Search size={28} />}
            title={state.data?.total ? 'لا نتائج مطابقة' : 'السجل فارغ'}
            text={
              state.data?.total
                ? 'جرّب جزءًا آخر من الاسم، أو اكتب الرقم القومي كاملًا.'
                : isAdmin
                  ? 'ارفع ملف الطلاب من الأعلى ليتمكن الطلاب من تفعيل حساباتهم.'
                  : 'لم يُرفع سجل الطلاب بعد. اطلب من المسؤول الرئيسي رفعه.'
            }
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>الطالب</th>
                  <th>الفرقة</th>
                  <th>الرقم الجامعي</th>
                  <th>الحالة</th>
                  <th>إجراء</th>
                </tr>
              </thead>
              <tbody>
                {state.data.students.map((s) => (
                  <tr key={s.id}>
                    <td className="roster-name">
                      <strong>{s.name}</strong>
                      <small className="muted">
                        الرقم القومي ينتهي بـ <bdi dir="ltr">{s.nationalLast4}</bdi>
                      </small>
                    </td>
                    <td>{s.year ?? '—'}</td>
                    <td dir="ltr">{s.studentId ?? '—'}</td>
                    <td>
                      <span
                        className={`roster-state ${STATES[s.state].tone}`}
                        title={STATES[s.state].hint}
                      >
                        {STATES[s.state].label}
                      </span>
                    </td>
                    <td>
                      <button
                        className="button tiny secondary"
                        disabled={s.state === 'disabled'}
                        onClick={() => setTarget(s)}
                      >
                        <KeyRound size={15} />
                        {s.state === 'none' ? 'تفعيل' : 'كلمة مؤقتة جديدة'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {target && (
        <div className="modal-backdrop" onClick={close}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="roster-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <span className="modal-icon">
                <KeyRound size={27} />
              </span>
              <button className="icon-button" type="button" aria-label="إغلاق" onClick={close}>
                <X size={19} />
              </button>
            </div>
            {issued ? (
              <>
                <h2 id="roster-modal-title">كلمة المرور المؤقتة</h2>
                <p>
                  سلّمها لـ <strong>{issued.name}</strong> مباشرة. لن تظهر مرة أخرى بعد إغلاق هذه
                  النافذة.
                </p>
                <div className="lp-temp-code">
                  <code dir="ltr">{issued.temporaryPassword}</code>
                  <button type="button" className="lp-temp-copy" onClick={copy}>
                    {copied ? <Check size={18} /> : <Copy size={18} />}
                    {copied ? 'تم النسخ' : 'نسخ'}
                  </button>
                </div>
                <p className="muted small-text">
                  يدخل الطالب برقمه القومي وهذه الكلمة، ثم يختار كلمة مرور خاصة به. مهلتها{' '}
                  {issued.hours.toLocaleString('ar-EG')} ساعة.
                </p>
                <div className="form-actions">
                  <button className="button primary" onClick={close}>
                    تم التسليم
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 id="roster-modal-title">
                  {target.state === 'none' ? 'تفعيل حساب الطالب؟' : 'إصدار كلمة مرور مؤقتة جديدة؟'}
                </h2>
                <p>
                  <strong>{target.name}</strong>
                </p>
                <p>
                  {target.state === 'active'
                    ? 'كلمة مروره الحالية ستتوقف عن العمل فورًا، وسيُطلب منه اختيار كلمة جديدة عند أول دخول.'
                    : 'ستُنشأ كلمة مرور مؤقتة جديدة تظهر لك مرة واحدة لتسلّمها له.'}
                </p>
                <p className="muted small-text">يُسجَّل هذا الإجراء باسمك في سجل الإدارة.</p>
                <div className="form-actions">
                  <button className="button primary" disabled={busy} onClick={issue}>
                    {busy ? 'جارٍ الإصدار…' : 'إصدار الكلمة'}
                  </button>
                  <button className="button secondary" disabled={busy} onClick={close}>
                    إلغاء
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}

interface Summary {
  added: number;
  updated: number;
  rejected: number;
  problems: { line: number; error: string }[];
}

function RosterImport({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setSummary(null);
    if (file.size > 8 * 1024 * 1024) return setError('الملف أكبر من ٨ ميجابايت.');
    if (/\.xlsx?$/i.test(file.name))
      return setError('احفظ الملف بصيغة CSV من Excel (حفظ باسم ← CSV UTF-8) ثم ارفعه.');
    const parsed = parseRosterCsv(await file.text());
    if (!parsed.rows.length)
      return setError(parsed.errors[0]?.error ?? 'لا توجد صفوف صالحة في الملف.');
    setBusy(true);
    const total: Summary = {
      added: 0,
      updated: 0,
      rejected: parsed.errors.length,
      problems: parsed.errors,
    };
    try {
      for (let i = 0; i < parsed.rows.length; i += CHUNK) {
        setProgress(
          `${Math.min(i + CHUNK, parsed.rows.length).toLocaleString('ar-EG')} من ${parsed.rows.length.toLocaleString('ar-EG')}`,
        );
        const rows: RosterRow[] = parsed.rows.slice(i, i + CHUNK);
        const out = await api<{ added: number; updated: number; rejected: unknown[] }>(
          '/admin/roster/import',
          { method: 'POST', body: JSON.stringify({ rows }) },
        );
        total.added += out.added;
        total.updated += out.updated;
        total.rejected += out.rejected.length;
      }
      setSummary(total);
      onDone();
      toast('تم رفع سجل الطلاب.');
    } catch (e) {
      setError(
        `توقف الرفع: ${(e as Error).message}. ما رُفع قبل ذلك محفوظ، وإعادة رفع الملف آمنة.`,
      );
    } finally {
      setBusy(false);
      setProgress('');
    }
  }
  const template = `data:text/csv;charset=utf-8,${encodeURIComponent(ROSTER_TEMPLATE)}`;
  return (
    <section className="card roster-import">
      <div>
        <h2>رفع سجل الكلية</h2>
        <p className="muted">
          ملف CSV بالأعمدة: الاسم، الرقم القومي (إلزامي)، الرقم الجامعي (اختياري)، الفرقة. رفعه مرة
          ثانية يحدّث البيانات دون حذف أحد أو المساس بالحسابات المفعّلة.
        </p>
      </div>
      <div className="roster-import-actions">
        <button className="button primary" disabled={busy} onClick={() => input.current?.click()}>
          <Upload size={17} />
          {busy ? `جارٍ الرفع… ${progress}` : 'اختيار ملف CSV'}
        </button>
        <a className="button secondary" href={template} download="roster-template.csv">
          <Download size={17} />
          نموذج الملف
        </a>
        <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={pick} />
      </div>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {summary && (
        <div className="info-box" role="status">
          <ShieldCheck size={22} />
          <div>
            <p>
              أُضيف <strong>{summary.added.toLocaleString('ar-EG')}</strong> وحُدّث{' '}
              <strong>{summary.updated.toLocaleString('ar-EG')}</strong>، وتعذّر{' '}
              <strong>{summary.rejected.toLocaleString('ar-EG')}</strong> صفًا.
            </p>
            {summary.problems.length > 0 && (
              <ul className="roster-problems">
                {summary.problems.slice(0, 8).map((p) => (
                  <li key={p.line}>
                    السطر {p.line.toLocaleString('ar-EG')}: {p.error}
                  </li>
                ))}
                {summary.problems.length > 8 && <li>…ومشاكل أخرى مماثلة.</li>}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
