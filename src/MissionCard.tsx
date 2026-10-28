import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, CircleDot, Flag, TriangleAlert } from 'lucide-react';
import { api, useSession, useToast } from './lib';
import { missionSteps } from './mission';
import type { ActivityRequest } from './types';

/** بطاقة «مهمتك»: تعليمات تسجيل النشاط خطوة بخطوة، وتتحدث تلقائيًا مع تقدم الطالب. */
export function MissionCard({
  request,
  force = false,
}: {
  request: ActivityRequest | null | undefined;
  force?: boolean;
}) {
  const { session, refresh } = useSession();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const dismissed = Boolean(session.user?.onboarding_dismissed);
  const approved = request?.status === 'approved';
  if (!force && (dismissed || approved)) return null;
  const steps = missionSteps(request, session.faculty.office, session.faculty.points);
  const doneCount = steps.filter((s) => s.state === 'done').length;
  const current = steps.find((s) => s.state === 'current' || s.state === 'attention');
  const fresh = !request && doneCount === 1;
  async function setDismissed(value: boolean) {
    setBusy(true);
    try {
      await api('/profile/onboarding', {
        method: 'PUT',
        body: JSON.stringify({ dismissed: value }),
      });
      await refresh();
      if (!value) toast('ستظهر التعليمات في الصفحة الرئيسية.');
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card mission-card" aria-labelledby="mission-title">
      <div className="mission-head">
        <span className="mission-flag">
          <Flag size={20} aria-hidden="true" />
        </span>
        <div>
          <h2 id="mission-title">
            {fresh
              ? `أهلًا بك في «${session.faculty.platformName}»! مهمتك الأولى`
              : 'مهمتك: تسجيل نشاطك بنجاح'}
          </h2>
          <p>
            {fresh
              ? `سجّل نشاطًا واحدًا واحصل على ${session.faculty.points} درجة بعد الاعتماد. اتبع الخطوات دي بالترتيب:`
              : `أنجزت ${doneCount} من ${steps.length} خطوات.`}
          </p>
        </div>
        <div className="mission-progress" aria-hidden="true">
          <i style={{ width: `${Math.round((doneCount / steps.length) * 100)}%` }} />
        </div>
      </div>
      <ol className="mission-steps">
        {steps.map((step, i) => {
          const open = step === current || (force && step.state !== 'done');
          return (
            <li key={step.id} className={`mission-step is-${step.state}`}>
              <span className="mission-dot" aria-hidden="true">
                {step.state === 'done' ? (
                  <Check size={15} />
                ) : step.state === 'attention' ? (
                  <TriangleAlert size={15} />
                ) : step.state === 'current' ? (
                  <CircleDot size={15} />
                ) : (
                  i + 1
                )}
              </span>
              <div>
                <strong>
                  {step.title}
                  {step.state === 'done' && <span className="sr-only"> (تم)</span>}
                  {step === current && <span className="sr-only"> (الخطوة الحالية)</span>}
                </strong>
                {open && (
                  <>
                    <ul className="mission-tips">
                      {step.tips.map((tip) => (
                        <li key={tip}>{tip}</li>
                      ))}
                    </ul>
                    {step.to && step === current && (
                      <Link to={step.to} className="button mission-cta">
                        {step.cta}
                        <ArrowLeft size={16} aria-hidden="true" />
                      </Link>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {!force && (
        <button
          type="button"
          className="mission-dismiss"
          disabled={busy}
          onClick={() => setDismissed(true)}
        >
          فهمت، أخفِ التعليمات
        </button>
      )}
      {force && dismissed && (
        <button
          type="button"
          className="mission-dismiss"
          disabled={busy}
          onClick={() => setDismissed(false)}
        >
          أظهر التعليمات في الصفحة الرئيسية
        </button>
      )}
    </section>
  );
}
