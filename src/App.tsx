const navItems = ['Library', 'Recommendation', 'Stats', 'Settings']

function App() {
  return (
    <div className="min-h-screen bg-shell-bg text-shell-text p-3 sm:p-4">
      <div className="mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-5xl flex-col rounded-2xl border border-shell-border bg-shell-panel shadow-panel sm:min-h-[calc(100vh-2rem)] lg:flex-row">
        <aside className="border-b border-shell-border p-4 lg:w-64 lg:border-b-0 lg:border-r">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-shell-muted">QuestShelf</p>
            <h1 className="mt-1 text-xl font-semibold">Your game backlog</h1>
          </div>

          <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:mt-8 lg:flex-col lg:overflow-visible">
            {navItems.map((item, index) => (
              <button
                key={item}
                className={`whitespace-nowrap rounded-lg border px-3 py-2 text-left text-sm transition ${
                  index === 0
                    ? 'border-shell-accent bg-shell-accentSoft text-shell-accent'
                    : 'border-shell-border bg-shell-panelSoft text-shell-text hover:border-shell-muted'
                }`}
              >
                {item}
              </button>
            ))}
          </nav>
        </aside>

        <main className="flex-1 p-4 sm:p-6">
          <header className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Library</h2>
            <span className="rounded-full border border-shell-border bg-shell-panelSoft px-3 py-1 text-xs text-shell-muted">
              Foundation layout
            </span>
          </header>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <article
                key={i}
                className="h-28 rounded-xl border border-shell-border bg-shell-panelSoft p-3"
              >
                <div className="h-3 w-20 rounded bg-shell-border" />
                <div className="mt-3 h-3 w-32 rounded bg-shell-border" />
                <div className="mt-6 h-2 w-24 rounded bg-shell-border/80" />
              </article>
            ))}
          </section>

          <section className="mt-4 rounded-xl border border-dashed border-shell-border p-4 text-sm text-shell-muted">
            Placeholder content area optimized for landscape handheld screens. Add feature modules here next.
          </section>
        </main>
      </div>
    </div>
  )
}

export default App
