const overlaySelector = [
  '[role="dialog"]',
  '[aria-modal="true"]',
  '[data-controller-modal]',
  '[data-lightbox]',
  '.qs-viewport-modal',
  '.qs-modal-panel',
  '.qs-action-sheet',
  '.qs-setup-widget',
].join(', ');

const interactiveSelector = [
  'input',
  'textarea',
  'select',
  'button',
  '[contenteditable="true"]',
  '[contenteditable=""]',
  '[role="textbox"]',
  overlaySelector,
].join(', ');

export function isInteractiveOrOverlayActive(target?: EventTarget | null): boolean {
  if (isOverlayActive()) {
    return true;
  }

  if (!(target instanceof Element)) {
    return false;
  }

  if (target.closest(interactiveSelector)) {
    return true;
  }

  const contentEditableElement = target.closest('[contenteditable]');
  return contentEditableElement instanceof HTMLElement && contentEditableElement.isContentEditable;
}

export function shouldIgnoreQuestQueueShortcut(event: KeyboardEvent): boolean {
  return event.defaultPrevented || isInteractiveOrOverlayActive(event.target);
}

export function isOverlayActive(): boolean {
  if (document.fullscreenElement) {
    return true;
  }

  if (document.documentElement.classList.contains('qs-modal-open')) {
    return true;
  }

  if (getOpenPopover()) {
    return true;
  }

  return Array.from(document.querySelectorAll<HTMLElement>(overlaySelector)).some(isVisibleOverlay);
}

function getOpenPopover(): Element | null {
  try {
    return document.querySelector(':popover-open');
  } catch {
    return null;
  }
}

function isVisibleOverlay(element: HTMLElement): boolean {
  if (element.closest('[inert], [aria-hidden="true"]')) {
    return false;
  }

  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
}
