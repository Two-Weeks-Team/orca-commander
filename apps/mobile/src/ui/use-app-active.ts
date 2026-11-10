import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

/**
 * True while the app is active. `onBecameActive` runs each time it comes back (for example from the Settings app). `inactive`
 * counts as not active: that is also when the app switcher takes its snapshot, which must not contain a camera preview.
 */
export function useAppActive(onBecameActive?: () => void): boolean {
  const [active, setActive] = useState(AppState.currentState === 'active');
  const callback = useRef(onBecameActive);
  callback.current = onBecameActive;
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      setActive(state === 'active');
      if (state === 'active') callback.current?.();
    });
    return () => subscription.remove();
  }, []);
  return active;
}
