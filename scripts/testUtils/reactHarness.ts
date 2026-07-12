/**
 * A minimal render/renderHook harness on top of react-dom/client + React's `act`.
 *
 * AS-03, AS-04 and AS-08 are all defects in how mounted React state interacts with
 * storage, so they can only be characterized by actually running the production hooks
 * and components. This is deliberately small — no testing-library — and depends on the
 * jsdom globals from `testEnvironment`, which must be installed first.
 */
import { act, createElement, type ComponentType, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

export type RenderHandle<TProps> = {
  /** Re-render with new props (the mounted component keeps its state). */
  rerender: (props: TProps) => Promise<void>;
  unmount: () => Promise<void>;
};

export type HookHandle<TProps, TResult> = RenderHandle<TProps> & {
  /** The hook's latest return value. */
  readonly current: TResult;
};

/** Run an update (and its effects) inside act(), like a real user interaction would. */
export async function actAsync(callback: () => void | Promise<void>): Promise<void> {
  await act(async () => {
    await callback();
  });
}

export async function renderComponent<TProps extends object>(
  Component: ComponentType<TProps>,
  props: TProps,
): Promise<RenderHandle<TProps>> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(createElement(Component, props) as ReactElement);
  });

  return {
    rerender: async (nextProps: TProps) => {
      await act(async () => {
        root.render(createElement(Component, nextProps) as ReactElement);
      });
    },
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

export async function renderHook<TProps, TResult>(
  useHook: (props: TProps) => TResult,
  initialProps: TProps,
): Promise<HookHandle<TProps, TResult>> {
  let latest: TResult;

  // The hook's argument is wrapped rather than spread as JSX props, so it can be any shape —
  // an array or a primitive as well as an object.
  type ProbeProps = { hookProps: TProps };

  function HookProbe({ hookProps }: ProbeProps) {
    latest = useHook(hookProps);
    return null;
  }

  const handle = await renderComponent<ProbeProps>(HookProbe, { hookProps: initialProps });

  return {
    get current() {
      return latest;
    },
    rerender: (props: TProps) => handle.rerender({ hookProps: props }),
    unmount: handle.unmount,
  };
}
