import { useEffect, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useI18n } from '../i18n';

const scrollablePanelSelector =
  '.qs-main-scroll, .qs-content-panel, .qs-queue-shell, .qs-review-shell, .qs-settings-detail, .qs-settings-list, .qs-scroll-panel';
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
  const { t } = useI18n();
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

  function scrollToTop(event?: MouseEvent<HTMLButtonElement> | KeyboardEvent<HTMLButtonElement>) {
    event?.preventDefault();
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const behavior: ScrollBehavior = motionPreference ? 'auto' : 'smooth';

    window.scrollTo({ top: 0, behavior });
    getScrollablePanels().forEach((panel) => {
      if (panel.scrollTop > 0) {
        panel.scrollTo({ top: 0, behavior });
      }
    });
  }

  return (
    <button
      aria-hidden={!isVisible}
      aria-label={t('common.backToTop')}
      className={`qs-header-back-to-top ${isVisible ? 'qs-header-back-to-top-visible' : ''}`}
      disabled={!isVisible}
      onClick={scrollToTop}
      title={t('common.backToTop')}
      type="button"
    >
      <span aria-hidden="true">↑</span>
      <span>{t('common.top')}</span>
    </button>
  );
}
