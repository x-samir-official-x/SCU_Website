import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** يُظهر عناصر [data-reveal] عند دخولها الشاشة؛ مع تقليل الحركة تظهر فورًا. */
export function useReveal() {
  useEffect(() => {
    const root = document.documentElement;
    const items = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (!items.length) return;
    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('is-in'));
      return;
    }
    root.classList.add('rv-on');
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );
    items.forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      root.classList.remove('rv-on');
    };
  }, []);
}

/**
 * يتابع التمرير في إطار رسم واحد: يحدّث حالة "تم التمرير" فقط عند التبدّل،
 * ويكتب التقدّم والإزاحة مباشرة على العناصر المعنية دون إعادة عرض React.
 */
export function useScrollState(
  progressRef: RefObject<HTMLElement | null>,
  parallaxRef: RefObject<HTMLElement | null>,
  threshold = 28,
) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setScrolled((was) => (y > threshold !== was ? y > threshold : was));
      progressRef.current?.style.setProperty('--p', String(max > 0 ? Math.min(1, y / max) : 0));
      if (y < window.innerHeight * 1.2) parallaxRef.current?.style.setProperty('--sy', String(y));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [progressRef, parallaxRef, threshold]);
  return scrolled;
}

/** يمنح العنصر إحداثيات المؤشر (-1..1) لتأثير عمق خفيف على الشاشات التي تدعم الماوس. */
export function usePointerParallax(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    let frame = 0;
    let nx = 0;
    let ny = 0;
    const apply = () => {
      frame = 0;
      el.style.setProperty('--mx', nx.toFixed(3));
      el.style.setProperty('--my', ny.toFixed(3));
    };
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      nx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      ny = ((e.clientY - r.top) / r.height - 0.5) * 2;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const leave = () => {
      nx = 0;
      ny = 0;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    el.addEventListener('pointermove', move, { passive: true });
    el.addEventListener('pointerleave', leave);
    return () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
      cancelAnimationFrame(frame);
    };
  }, [ref]);
}

/** القسم الظاهر حاليًا من الصفحة، لتمييز الرابط النشط في الشريط العلوي. */
export function useScrollSpy(ids: string[]) {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join('|');
  useEffect(() => {
    const sections = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (!sections.length || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setActive(entry.target.id);
      },
      { rootMargin: '-38% 0px -52% 0px' },
    );
    sections.forEach((s) => io.observe(s));
    const top = () => {
      if (window.scrollY < 160) setActive(null);
    };
    window.addEventListener('scroll', top, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', top);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return active;
}

/** عدّاد يصعد من صفر إلى القيمة عند ظهوره، بأرقام عربية. */
export function useCountUp(ref: RefObject<HTMLElement | null>, to: number, duration = 1500) {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? to : 0));
  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(to);
      return;
    }
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) {
      setValue(to);
      return;
    }
    let frame = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / duration);
          setValue(Math.round(to * (1 - Math.pow(1 - p, 4))));
          if (p < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [ref, to, duration]);
  return value;
}

/** قياس موضع المؤشّر المنزلق خلف روابط التنقل. */
export function useSlidingIndicator(
  listRef: RefObject<HTMLElement | null>,
  target: string | null,
  deps: unknown[],
) {
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const place = () => {
      const el = target ? list.querySelector<HTMLElement>(`[data-nav="${target}"]`) : null;
      if (!el) {
        list.dataset.on = 'false';
        return;
      }
      const l = list.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      list.style.setProperty('--x', `${r.left - l.left}px`);
      list.style.setProperty('--w', `${r.width}px`);
      list.dataset.on = 'true';
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listRef, target, ...deps]);
}
