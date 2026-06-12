import { useEffect, useState } from 'react';
import { controllerConnectionChangeEvent, hasConnectedGamepad } from '../lib/androidGamepadShortcuts';

export function useGamepadDetection() {
  const [hasGamepad, setHasGamepad] = useState(() => hasConnectedGamepad());

  useEffect(() => {
    function syncGamepadState() {
      setHasGamepad(hasConnectedGamepad());
    }

    function handleControllerConnectionChange(event: Event) {
      setHasGamepad(Boolean((event as CustomEvent<boolean>).detail));
    }

    syncGamepadState();
    window.addEventListener(controllerConnectionChangeEvent, handleControllerConnectionChange as EventListener);
    window.addEventListener('gamepadconnected', syncGamepadState);
    window.addEventListener('gamepaddisconnected', syncGamepadState);

    return () => {
      window.removeEventListener(controllerConnectionChangeEvent, handleControllerConnectionChange as EventListener);
      window.removeEventListener('gamepadconnected', syncGamepadState);
      window.removeEventListener('gamepaddisconnected', syncGamepadState);
    };
  }, []);

  return hasGamepad;
}
