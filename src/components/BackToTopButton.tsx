import { useEffect, useState } from 'react';

const scrollablePanelSelector = '.qs-content-panel, .qs-queue-shell, .qs-review-shell, .qs-settings-detail, .qs-settings-list';
const scrollThresholdPx = 300;

function getScrollablePanels() {
  return Array.from(document.querySelectorAll<HTMLElement>(scrollablePanelSelector));
}

function shouldShowBackToTop() {
  const viewportThreshold = typeof window === 'undefined' ? scrollThresholdPx : Math.min(scrollThresholdPx, window.innerHeight || scrollThresholdPx);

  if (window.scrollY > viewportThreshold) {
    return true;
  }

  return getScrollablePanels().some((panel) => panel.scrollTop > viewportThreshold);
}

export function BackToTopButton() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    let animationFrame = 0;

    const updateVisibility = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        setIsVisible(shouldShowBackToTop());
      });
    };

    updateVisibility();
    window.addEventListener('scroll', updateVisibility, { capture: true, passive: true });
    window.addEventListener('resize', updateVisibility, { passive: true });

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('scroll', updateVisibility, { capture: true });
      window.removeEventListener('resize', updateVisibility);
    };
  }, []);

  function scrollToTop() {
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const behavior: ScrollBehavior = motionPreference ? 'auto' : 'smooth';

    window.scrollTo({ top: 0, behavior });
    getScrollablePanels().forEach((panel) => {
      if (panel.scrollTop > 0) {
        panel.scrollTo({ top: 0, behavior });
      }
    });
  }

  if (!isVisible) {
    return null;
  }

  return (
    <button
      aria-label="Back to top"
      className="qs-back-to-top"
      onClick={scrollToTop}
      type="button"
    >
      <span aria-hidden="true">↑</span>
    </button>
  );
}
