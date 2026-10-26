import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpLeft, GraduationCap, Menu, X } from 'lucide-react';
import { useSession } from './lib';

const sections = [
  { id: 'activities', label: 'أنشطة الطلاب' },
  { id: 'journey', label: 'خطوات التسجيل' },
  { id: 'questions', label: 'الأسئلة الشائعة' },
];

export function LandingNav() {
  const { session } = useSession();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState('');
  const header = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Observe section boundaries without doing work on every scroll frame.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length) setActive(visible[0].target.id);
      },
      { rootMargin: '-22% 0px -72% 0px' },
    );
    for (const selector of ['.lp-hero', ...sections.map((section) => `#${section.id}`)]) {
      const section = document.querySelector(selector);
      if (section) observer.observe(section);
    }
    const desktop = window.matchMedia('(min-width: 901px)');
    const closeOnDesktop = () => {
      if (desktop.matches) setOpen(false);
    };
    desktop.addEventListener('change', closeOnDesktop);
    return () => {
      observer.disconnect();
      desktop.removeEventListener('change', closeOnDesktop);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!header.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <header className="lp-header" ref={header}>
      <div className="lp-container lp-nav">
        <Link to="/" className="lp-wordmark" onClick={() => setOpen(false)}>
          <GraduationCap size={27} aria-hidden="true" />
          <span>
            كلية التجارة<small>بوابة النشاط الطلابي</small>
          </span>
        </Link>
        <button
          ref={toggle}
          className={`lp-menu ${open ? 'is-open' : ''}`}
          aria-label={open ? 'إغلاق قائمة التنقل' : 'فتح قائمة التنقل'}
          aria-expanded={open}
          aria-controls="landing-navigation"
          onClick={() => setOpen((value) => !value)}
        >
          <Menu className="lp-menu-bars" size={21} aria-hidden="true" />
          <X className="lp-menu-close" size={21} aria-hidden="true" />
        </button>
        <nav id="landing-navigation" aria-label="التنقل الرئيسي" className={open ? 'is-open' : ''}>
          {sections.map((section) => (
            <a
              href={`#${section.id}`}
              key={section.id}
              aria-current={active === section.id ? 'location' : undefined}
              onClick={() => {
                setActive(section.id);
                setOpen(false);
              }}
            >
              <span>{section.label}</span>
            </a>
          ))}
        </nav>
        <Link to={session.user ? '/dashboard' : '/login'} className="lp-nav-login">
          {session.user ? 'حسابي' : 'تسجيل الدخول'}
          <ArrowUpLeft size={17} aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
}
