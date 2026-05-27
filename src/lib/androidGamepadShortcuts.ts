const gamepadPollIntervalMs = 120;

type GamepadButtonState = {
  back: boolean;
  primary: boolean;
  secondary: boolean;
};

export function configureAndroidGamepadShortcuts() {
  if (typeof window === 'undefined' || !('getGamepads' in navigator)) {
    return () => undefined;
  }

  let lastState: GamepadButtonState = {
    back: false,
    primary: false,
    secondary: false,
  };

  const intervalId = window.setInterval(() => {
    const gamepad = Array.from(navigator.getGamepads()).find(Boolean);

    if (!gamepad) {
      return;
    }

    const nextState: GamepadButtonState = {
      primary: Boolean(gamepad.buttons[0]?.pressed),
      back: Boolean(gamepad.buttons[1]?.pressed),
      secondary: Boolean(gamepad.buttons[3]?.pressed),
    };

    if (nextState.back && !lastState.back) {
      window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    }

    if (nextState.secondary && !lastState.secondary) {
      clickVisibleButton(['Select', 'Exit select']);
    }

    if (nextState.primary && !lastState.primary && document.activeElement instanceof HTMLElement) {
      document.activeElement.click();
    }

    lastState = nextState;
  }, gamepadPollIntervalMs);

  return () => window.clearInterval(intervalId);
}

function clickVisibleButton(labels: string[]) {
  const buttons = Array.from(document.querySelectorAll('button'));
  const targetButton = buttons.find((button) => {
    const label = button.textContent?.trim();
    return label && labels.includes(label) && button.offsetParent !== null && !button.disabled;
  });

  targetButton?.click();
}
