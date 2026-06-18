import type { ReactNode, RefObject } from 'react';

export type GameListShellProps = {
  children: ReactNode;
  className?: string;
  stickyChrome?: ReactNode;
  topChrome?: ReactNode;
  scrollRef: RefObject<HTMLElement | null>;
};

export function GameListShell({ children, className = '', scrollRef, stickyChrome, topChrome }: GameListShellProps) {
  return (
    <section ref={scrollRef} className={`qs-game-list-shell qs-content-panel qs-glass min-w-0 rounded-lg border p-2 sm:p-3 ${className}`.trim()}>
      {stickyChrome ? <div className="qs-game-list-sticky-chrome -mx-2 px-2 pb-2 sm:-mx-3 sm:px-3">{stickyChrome}</div> : null}
      {topChrome}
      <div className="qs-game-list-content">{children}</div>
    </section>
  );
}

export function GameListEmptyState({ text, title }: { text: string; title: string }) {
  return (
    <div className="qs-game-list-empty grid min-h-32 place-items-center rounded-lg border border-dashed border-skyglass/20 bg-ink-950/60 p-4 text-center">
      <div>
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">{text}</p>
      </div>
    </div>
  );
}
