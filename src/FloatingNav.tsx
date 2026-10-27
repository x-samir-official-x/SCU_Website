import { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpLeft, ArrowLeft } from 'lucide-react';
import { logoSrc, usePresence, useSession } from './lib';
import { useScrollSpy, useScrollState, useSlidingIndicator } from './hooks';

const links = [
  { id: 'activities', label: 'أنشطة الطلاب', hint: 'نماذج من الحياة الجامعية' },
  { id: 'journey', label: 'خطوات التسجيل', hint: 'من المشاركة إلى الاعتماد' },
  { id: 'questions', label: 'الأسئلة الشائعة', hint: 'إجابات قبل أن تبدأ' },
];

/** شريط التنقل العائم: كبسولة زجاجية، مؤشر منزلق، تتبّع للقسم الحالي، وقائمة موبايل مستقلة. */
export function FloatingNav({ parallaxRef }: { parallaxRef: React.RefObject<HTMLElement | null> }) {
  const { session } = useSession();
  const navRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const scrolled = useScrollState(navRef, parallaxRef);
  const active = useScrollSpy(links.map((l) => l.id));
  const sheet = usePresence(menu, 260);
  useSlidingIndicator(listRef, hover ?? active, [scrolled]);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menu]);

  const cta = session.user ? 'حسابي' : 'تسجيل الدخول';
  const to = session.user ? '/dashboard' : '/login';
  return (
    <>
      <header className="fnav-wrap">
        <nav
          ref={navRef}
          className="fnav"
          data-scrolled={scrolled}
          data-menu={menu}
          aria-label="التنقل الرئيسي"
        >
          <Link
            to="/"
            className="fnav-brand"
            aria-label={`${session.faculty.platformName} — ${session.faculty.brand}، الصفحة الرئيسية`}
          >
            <img
              className="fnav-logos"
              src={logoSrc(session.faculty.logoPath)}
              width="2001"
              height="786"
              alt="شعارا جامعة قناة السويس وكلية التجارة"
              fetchPriority="high"
            />
            <span className="fnav-brand-text">
              <strong lang="ar">{session.faculty.platformName}</strong>
              <small>{session.faculty.brand}</small>
            </span>
          </Link>
          <div
            className="fnav-links"
            ref={listRef}
            data-on="false"
            onMouseLeave={() => setHover(null)}
            onBlur={() => setHover(null)}
          >
            <span className="fnav-pill" aria-hidden="true" />
            {links.map((l) => (
              <a
                key={l.id}
                href={`#${l.id}`}
                data-nav={l.id}
                aria-current={active === l.id ? 'true' : undefined}
                onMouseEnter={() => setHover(l.id)}
                onFocus={() => setHover(l.id)}
              >
                {l.label}
              </a>
            ))}
          </div>
          <Link to={to} className="fnav-cta">
            <span className="fnav-cta-long">{cta}</span>
            <span className="fnav-cta-short">{session.user ? 'حسابي' : 'دخول'}</span>
            <ArrowUpLeft size={17} />
          </Link>
          <button
            className="fnav-burger"
            aria-label={menu ? 'إغلاق قائمة التنقل' : 'فتح قائمة التنقل'}
            aria-expanded={menu}
            aria-controls="fnav-sheet"
            onClick={() => setMenu((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>
          <span className="fnav-progress" aria-hidden="true" />
        </nav>
      </header>
      {sheet.render && (
        <>
          <button
            className="fnav-scrim"
            data-state={sheet.state}
            aria-label="إغلاق القائمة"
            tabIndex={-1}
            onClick={() => setMenu(false)}
          />
          <div
            id="fnav-sheet"
            className="fnav-sheet"
            data-state={sheet.state}
            role="navigation"
            aria-label="قائمة التنقل"
          >
            {links.map((l, i) => (
              <a
                key={l.id}
                href={`#${l.id}`}
                style={{ '--i': i } as React.CSSProperties}
                onClick={() => setMenu(false)}
              >
                <span className="fnav-sheet-n">٠{['١', '٢', '٣'][i]}</span>
                <span className="fnav-sheet-t">
                  <strong>{l.label}</strong>
                  <small>{l.hint}</small>
                </span>
                <ArrowLeft size={18} />
              </a>
            ))}
            <Link
              to={to}
              className="fnav-sheet-cta"
              style={{ '--i': links.length } as React.CSSProperties}
              onClick={() => setMenu(false)}
            >
              {cta}
              <ArrowUpLeft size={18} />
            </Link>
          </div>
        </>
      )}
    </>
  );
}
