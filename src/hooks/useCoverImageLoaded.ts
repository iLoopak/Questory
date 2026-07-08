import { useEffect, useRef, useState } from 'react';

/**
 * Tracks whether a cover `<img>` has finished loading, so cards can fade the
 * artwork in only once it is ready.
 *
 * Crucially, it also recovers the "loaded but `onLoad` was missed" case: when a
 * cached image finishes loading before React attaches its `onLoad` handler — very
 * common on the fresh mounts a virtualized list produces during fast scroll — the
 * event never fires, and a purely event-driven flag would leave the cover stuck at
 * `opacity-0` even though the artwork is present. To avoid that, an effect keyed on
 * the active source reads the real DOM node (`img.complete && naturalWidth`) and
 * marks it loaded immediately when the browser already has it.
 *
 * Pass the ref to the `<img>` and wire `markLoaded`/`markBroken` to onLoad/onError.
 */
export function useCoverImageLoaded(activeCoverSource: string | null | undefined) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const img = imgRef.current;
    // Already complete (cached) → show it now; otherwise reset and wait for onLoad.
    setIsLoaded(Boolean(img && img.complete && img.naturalWidth > 0));
  }, [activeCoverSource]);

  const markLoaded = () => setIsLoaded(true);
  const markBroken = () => setIsLoaded(false);

  return { imgRef, isLoaded, markLoaded, markBroken };
}
