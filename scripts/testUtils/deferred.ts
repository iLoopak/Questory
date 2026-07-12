/**
 * Manually-controlled promises for failure-injection tests.
 *
 * Characterization tests for the persistence boundaries need to hold a write open
 * (to prove a caller did NOT await it) and then settle it on demand, in a chosen
 * order. A Deferred is the primitive for that.
 */
export type Deferred<T = void> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  /** True once resolve() or reject() has been called. */
  isSettled: () => boolean;
};

export function createDeferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  let settled = false;

  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = (value: T) => {
      settled = true;
      resolvePromise(value);
    };
    reject = (reason: unknown) => {
      settled = true;
      rejectPromise(reason);
    };
  });

  // Nothing in these tests attaches a handler at creation time, so an eventual
  // rejection would otherwise surface as an unhandled rejection before the code
  // under test gets a chance to catch it.
  promise.catch(() => {});

  return { promise, resolve, reject, isSettled: () => settled };
}
