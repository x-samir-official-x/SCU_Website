import { useEffect, useState } from 'react';
import facultyFallback from '../config/faculty.json';

const SHOW_MS = 2400;
const LEAVE_MS = 800;

/** تُعرض مع كل فتح أو إعادة تحميل للموقع (وليس مع التنقل بين الصفحات)، ولا تُعرض للأتمتة (الاختبارات) إلا بـ ?splash=1. */
function shouldShow(): boolean {
  try {
    if (new URLSearchParams(location.search).get('splash') === '1') return true;
    return !navigator.webdriver;
  } catch {
    return true;
  }
}

/**
 * شاشة افتتاحية: خلفية الكلية نفسها المستخدمة في أول الصفحة مع شعاري الكلية والجامعة في المنتصف،
 * ثم تتلاشى مع تكبير الشعار برفق لتكشف الموقع. تُغلق بأي نقرة أو مفتاح، وتقصر مع تقليل الحركة.
 */
export function Splash() {
  const [phase, setPhase] = useState<'off' | 'show' | 'leave'>(() =>
    shouldShow() ? 'show' : 'off',
  );
  useEffect(() => {
    if (phase === 'off') return;
    document.documentElement.classList.toggle('splash-lock', phase === 'show');
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const show = reduced ? 900 : SHOW_MS;
    const timers: number[] = [];
    if (phase === 'show') timers.push(window.setTimeout(() => setPhase('leave'), show));
    if (phase === 'leave') timers.push(window.setTimeout(() => setPhase('off'), LEAVE_MS));
    const skip = () => setPhase((p) => (p === 'show' ? 'leave' : p));
    window.addEventListener('keydown', skip);
    window.addEventListener('pointerdown', skip);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
    };
  }, [phase]);
  if (phase === 'off') return null;
  return (
    <div className={`splash splash-${phase}`} aria-hidden="true" data-testid="splash">
      <picture className="splash-bg">
        <source media="(max-width: 700px)" srcSet="/photos/hero-mobile.webp" />
        <img src="/photos/hero.webp" alt="" fetchPriority="high" decoding="async" />
      </picture>
      <div className="splash-center">
        <div className="splash-glow" />
        <div className="splash-logos">
          <span className="splash-disc splash-disc-a">
            <img
              src="/brand/splash-university.webp"
              width="420"
              height="420"
              alt=""
              decoding="async"
            />
          </span>
          <span className="splash-divider" />
          <span className="splash-disc splash-disc-b">
            <img
              src="/brand/splash-college.webp"
              width="420"
              height="420"
              alt=""
              decoding="async"
            />
          </span>
        </div>
        <div className="splash-title" lang="ar">
          {facultyFallback.platformName}
        </div>
        <div className="splash-sub">{facultyFallback.brand}</div>
        <div className="splash-org">
          {facultyFallback.faculty} | {facultyFallback.university}
        </div>
        <div className="splash-bar">
          <span style={{ animationDuration: `${SHOW_MS}ms` }} />
        </div>
      </div>
    </div>
  );
}
