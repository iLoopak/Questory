const gamepadPollIntervalMs = 80;
const axisRepeatInitialMs = 240;
const axisRepeatMs = 150;
const axisThreshold = 0.55;
const debugStorageKey = 'questshelf.controllerDebug.v1';
const focusableSelector = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

type GamepadButtonName =
  | 'A'
  | 'B'
  | 'X'
  | 'Y'
  | 'L1'
  | 'R1'
  | 'L2'
  | 'R2'
  | 'Select'
  | 'Start'
  | 'L3'
  | 'R3'
  | 'D-pad Up'
  | 'D-pad Down'
  | 'D-pad Left'
  | 'D-pad Right';

type Direction = 'down' | 'left' | 'right' | 'up';

type ButtonState = Record<GamepadButtonName, boolean>;

type AxisRepeatState = {
  direction: Direction | null;
  lastFiredAt: number;
  startedAt: number;
};

const buttonIndexMap: Array<[GamepadButtonName, number]> = [
  ['A', 0],
  ['B', 1],
  ['X', 2],
  ['Y', 3],
  ['L1', 4],
  ['R1', 5],
  ['L2', 6],
  ['R2', 7],
  ['Select', 8],
  ['Start', 9],
  ['L3', 10],
  ['R3', 11],
  ['D-pad Up', 12],
  ['D-pad Down', 13],
  ['D-pad Left', 14],
  ['D-pad Right', 15],
];

const emptyButtonState = Object.fromEntries(buttonIndexMap.map(([name]) => [name, false])) as ButtonState;

export function configureAndroidGamepadShortcuts() {
  if (typeof window === 'undefined' || !('getGamepads' in navigator)) {
    return () => undefined;
  }

  let lastState: ButtonState = { ...emptyButtonState };
  let axisRepeatState: AxisRepeatState = { direction: null, lastFiredAt: 0, startedAt: 0 };
  let latestDebugState: ControllerDebugState = createEmptyDebugState();
  let debugOverlay: HTMLDivElement | null = null;
  let isDebugEnabled = loadControllerDebugEnabled();

  const removeFocusGuard = installFocusGuard();
  updateControllerActive(false);
  window.addEventListener('questshelf:controller-debug-change', handleDebugChange);
  window.addEventListener('keydown', handleKeyboardFallback, true);

  const intervalId = window.setInterval(() => {
    const gamepad = getPrimaryGamepad();

    if (!gamepad) {
      updateControllerActive(false);
      latestDebugState = createEmptyDebugState();
      renderDebugOverlay();
      return;
    }

    updateControllerActive(true);
    ensureFocus();

    const nextState = getButtonState(gamepad);
    const pressedButtons = buttonIndexMap
      .filter(([, index]) => Boolean(gamepad.buttons[index]?.pressed))
      .map(([name]) => name);
    const axisDirection = getAxisDirection(gamepad);

    handlePressedButton('D-pad Up', nextState, lastState, () => moveFocus('up'));
    handlePressedButton('D-pad Down', nextState, lastState, () => moveFocus('down'));
    handlePressedButton('D-pad Left', nextState, lastState, () => moveFocus('left'));
    handlePressedButton('D-pad Right', nextState, lastState, () => moveFocus('right'));
    handleAxisNavigation(axisDirection);

    handlePressedButton('A', nextState, lastState, () => activatePrimaryButton());
    handlePressedButton('B', nextState, lastState, () => dispatchKeyboard('Escape'));
    handlePressedButton('X', nextState, lastState, () => dispatchKeyboard('x'));
    handlePressedButton('Y', nextState, lastState, () => dispatchKeyboard('y'));
    handlePressedButton('L1', nextState, lastState, () => dispatchKeyboard('PageUp'));
    handlePressedButton('R1', nextState, lastState, () => dispatchKeyboard('PageDown'));
    handlePressedButton('Start', nextState, lastState, () => dispatchKeyboard('m'));

    latestDebugState = {
      axes: gamepad.axes.map((axis) => Number(axis.toFixed(2))),
      buttons: pressedButtons,
      connected: true,
      focusedElement: describeElement(document.activeElement),
      gamepadId: gamepad.id,
      timestamp: new Date().toLocaleTimeString(),
    };
    renderDebugOverlay();
    lastState = nextState;
  }, gamepadPollIntervalMs);

  function handleAxisNavigation(direction: Direction | null) {
    const now = performance.now();

    if (!direction) {
      axisRepeatState = { direction: null, lastFiredAt: 0, startedAt: 0 };
      return;
    }

    if (axisRepeatState.direction !== direction) {
      axisRepeatState = { direction, lastFiredAt: now, startedAt: now };
      moveFocus(direction);
      return;
    }

    const delay = axisRepeatState.lastFiredAt === axisRepeatState.startedAt ? axisRepeatInitialMs : axisRepeatMs;
    if (now - axisRepeatState.lastFiredAt >= delay) {
      axisRepeatState = { ...axisRepeatState, lastFiredAt: now };
      moveFocus(direction);
    }
  }

  function handleDebugChange(event: Event) {
    isDebugEnabled = Boolean((event as CustomEvent<boolean>).detail);
    renderDebugOverlay();
  }

  function renderDebugOverlay() {
    if (!isDebugEnabled) {
      debugOverlay?.remove();
      debugOverlay = null;
      return;
    }

    if (!debugOverlay) {
      debugOverlay = document.createElement('div');
      debugOverlay.className = 'qs-controller-debug';
      debugOverlay.setAttribute('aria-live', 'polite');
      document.body.append(debugOverlay);
    }

    debugOverlay.innerHTML = `
      <strong>Controller debug</strong>
      <span>${latestDebugState.connected ? 'Connected' : 'No controller'}</span>
      <span>${escapeHtml(latestDebugState.gamepadId || '—')}</span>
      <span>Buttons: ${escapeHtml(latestDebugState.buttons.join(', ') || '—')}</span>
      <span>Axes: ${escapeHtml(latestDebugState.axes.join(', ') || '—')}</span>
      <span>Focus: ${escapeHtml(latestDebugState.focusedElement || '—')}</span>
      <span>${escapeHtml(latestDebugState.timestamp || '')}</span>
    `;
  }

  return () => {
    window.clearInterval(intervalId);
    window.removeEventListener('questshelf:controller-debug-change', handleDebugChange);
    window.removeEventListener('keydown', handleKeyboardFallback, true);
    removeFocusGuard();
    debugOverlay?.remove();
  };
}

export function loadControllerDebugEnabled() {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(debugStorageKey) === 'true';
}

export function saveControllerDebugEnabled(isEnabled: boolean) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(debugStorageKey, String(isEnabled));
  window.dispatchEvent(new CustomEvent('questshelf:controller-debug-change', { detail: isEnabled }));
}

function getPrimaryGamepad() {
  return Array.from(navigator.getGamepads()).find((gamepad) => gamepad?.connected) ?? null;
}

function getButtonState(gamepad: Gamepad) {
  return Object.fromEntries(buttonIndexMap.map(([name, index]) => [name, Boolean(gamepad.buttons[index]?.pressed)])) as ButtonState;
}

function handlePressedButton(name: GamepadButtonName, nextState: ButtonState, lastState: ButtonState, action: () => void) {
  if (nextState[name] && !lastState[name]) {
    action();
  }
}

function getAxisDirection(gamepad: Gamepad): Direction | null {
  const horizontalAxis = gamepad.axes[0] ?? 0;
  const verticalAxis = gamepad.axes[1] ?? 0;

  if (Math.abs(horizontalAxis) < axisThreshold && Math.abs(verticalAxis) < axisThreshold) {
    return null;
  }

  if (Math.abs(horizontalAxis) > Math.abs(verticalAxis)) {
    return horizontalAxis > 0 ? 'right' : 'left';
  }

  return verticalAxis > 0 ? 'down' : 'up';
}

function moveFocus(direction: Direction) {
  if (isTextEntryElement(document.activeElement)) {
    return;
  }

  const candidates = getFocusableElements();
  if (candidates.length === 0) {
    return;
  }

  const currentElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (!currentElement || !candidates.includes(currentElement)) {
    focusElement(candidates[0]);
    return;
  }

  const currentRect = currentElement.getBoundingClientRect();
  const currentCenter = getRectCenter(currentRect);
  const rankedCandidates = candidates
    .filter((candidate) => candidate !== currentElement)
    .map((candidate) => {
      const rect = candidate.getBoundingClientRect();
      const center = getRectCenter(rect);
      const primaryDistance = getPrimaryDistance(direction, currentCenter, center);
      const secondaryDistance = getSecondaryDistance(direction, currentCenter, center);

      return { candidate, primaryDistance, secondaryDistance };
    })
    .filter(({ primaryDistance }) => primaryDistance > -4)
    .sort((first, second) => {
      const firstPenalty = first.primaryDistance + first.secondaryDistance * 1.75;
      const secondPenalty = second.primaryDistance + second.secondaryDistance * 1.75;
      return firstPenalty - secondPenalty;
    });

  const target = rankedCandidates[0]?.candidate ?? getSequentialFallback(candidates, currentElement, direction);
  if (target) {
    focusElement(target);
  }
}

function getSequentialFallback(candidates: HTMLElement[], currentElement: HTMLElement, direction: Direction) {
  const currentIndex = candidates.indexOf(currentElement);
  const delta = direction === 'up' || direction === 'left' ? -1 : 1;
  return candidates[(currentIndex + delta + candidates.length) % candidates.length];
}

function getPrimaryDistance(direction: Direction, current: Point, target: Point) {
  if (direction === 'left') {
    return current.x - target.x;
  }

  if (direction === 'right') {
    return target.x - current.x;
  }

  if (direction === 'up') {
    return current.y - target.y;
  }

  return target.y - current.y;
}

function getSecondaryDistance(direction: Direction, current: Point, target: Point) {
  return direction === 'left' || direction === 'right' ? Math.abs(target.y - current.y) : Math.abs(target.x - current.x);
}

type Point = { x: number; y: number };

function getRectCenter(rect: DOMRect): Point {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function activatePrimaryButton() {
  const dispatchedEvent = dispatchKeyboard('a');
  if (dispatchedEvent.defaultPrevented) {
    return;
  }

  activateFocusedElement();
}

function activateFocusedElement() {
  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement)) {
    ensureFocus();
    return;
  }

  if (activeElement.matches('select')) {
    dispatchKeyboard('Enter');
    return;
  }

  activeElement.click();
}

function dispatchKeyboard(key: string) {
  const target = document.activeElement instanceof HTMLElement ? document.activeElement : window;
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key });
  target.dispatchEvent(event);
  return event;
}

function handleKeyboardFallback(event: KeyboardEvent) {
  if (!document.body.classList.contains('qs-controller-active')) {
    return;
  }

  if (event.defaultPrevented || isTextEntryElement(event.target)) {
    return;
  }

  if (event.key === 'x' || event.key === 'X' || event.key === 'y' || event.key === 'Y') {
    const target = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const gameCard = target?.closest('.qs-game-card');
    const moreButton = gameCard?.querySelector<HTMLButtonElement>('[data-controller-action="context-menu"]');
    const multiSelectCard = gameCard instanceof HTMLElement && gameCard.getAttribute('role') === 'button' ? gameCard : null;

    if (moreButton && !multiSelectCard) {
      event.preventDefault();
      moreButton.click();
      moreButton.focus({ preventScroll: true });
      return;
    }

    if (multiSelectCard) {
      event.preventDefault();
      multiSelectCard.click();
    }
  }
}

function installFocusGuard() {
  const restoreFocus = () => window.requestAnimationFrame(() => ensureFocus());
  document.addEventListener('visibilitychange', restoreFocus);
  window.addEventListener('popstate', restoreFocus);

  const observer = new MutationObserver(restoreFocus);
  observer.observe(document.body, { childList: true, subtree: true });

  return () => {
    document.removeEventListener('visibilitychange', restoreFocus);
    window.removeEventListener('popstate', restoreFocus);
    observer.disconnect();
  };
}

function ensureFocus() {
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement && isFocusable(activeElement) && isVisible(activeElement)) {
    activeElement.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return;
  }

  const firstFocusable = getFocusableElements()[0];
  focusElement(firstFocusable);
}

function getFocusableElements() {
  const root = getActiveFocusRoot();
  return Array.from(root.querySelectorAll<HTMLElement>(focusableSelector)).filter(isFocusable).filter(isVisible);
}

function getActiveFocusRoot(): ParentNode {
  const modalRoots = Array.from(
    document.querySelectorAll<HTMLElement>('[role="dialog"], [data-controller-modal], .qs-setup-widget'),
  ).filter(isVisible);

  return modalRoots.at(-1) ?? document;
}

function isFocusable(element: HTMLElement) {
  if (element.closest('[inert], [aria-hidden="true"]')) {
    return false;
  }

  return !('disabled' in element && Boolean(element.disabled));
}

function isVisible(element: HTMLElement) {
  const rects = element.getClientRects();
  return rects.length > 0 && element.offsetParent !== null;
}

function focusElement(element: HTMLElement | undefined) {
  if (!element) {
    return;
  }

  element.focus({ preventScroll: true });
  element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function updateControllerActive(isActive: boolean) {
  document.body.classList.toggle('qs-controller-active', isActive);
}

function isTextEntryElement(target: EventTarget | Element | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

type ControllerDebugState = {
  axes: number[];
  buttons: string[];
  connected: boolean;
  focusedElement: string;
  gamepadId: string;
  timestamp: string;
};

function createEmptyDebugState(): ControllerDebugState {
  return {
    axes: [],
    buttons: [],
    connected: false,
    focusedElement: describeElement(document.activeElement),
    gamepadId: '',
    timestamp: '',
  };
}

function describeElement(element: Element | null) {
  if (!(element instanceof HTMLElement)) {
    return '';
  }

  const label = element.getAttribute('aria-label') || element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 48) || '';
  return [element.tagName.toLowerCase(), element.id ? `#${element.id}` : '', label ? `“${label}”` : ''].join(' ');
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => {
    const replacements: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return replacements[character];
  });
}
