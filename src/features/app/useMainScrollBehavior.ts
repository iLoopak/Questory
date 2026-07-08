import { useEffect, useRef, useState } from 'react';

export function useMainScrollBehavior() {
  const [isScrolled, setIsScrolled] = useState(false);
  const mainContentRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = mainContentRef.current;
    if (!el) return;
    function handleScroll() {
      const nextIsScrolled = el!.scrollTop > 15;
      setIsScrolled((current) => (current === nextIsScrolled ? current : nextIsScrolled));
    }
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  return { isScrolled, mainContentRef };
}
