import { useMemoriesList } from '@/hooks/use-memories';

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export default function App() {
  const { data, isLoading, isError, error } = useMemoriesList({ limit: 10 });

  return (
    <div className="flex min-h-screen flex-col gap-6 bg-[var(--color-bg-primary)] p-8">
      <header className="flex items-baseline gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">
          Echo Studio
        </h1>
        <span className="text-xs text-[var(--color-text-muted)]">v0.1.0 · Phase 1</span>
        <span className="ml-auto h-2 w-2 rounded-full bg-[var(--color-accent)]" />
      </header>

      {isLoading && <p className="text-sm text-[var(--color-text-muted)]">Loading memories…</p>}

      {isError && (
        <pre className="whitespace-pre-wrap rounded-md border border-[var(--color-danger)] bg-[var(--color-bg-secondary)] p-4 text-xs text-[var(--color-danger)]">
          {String(error)}
        </pre>
      )}

      {data && (
        <>
          <section className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] p-4 text-sm">
            <p className="text-[var(--color-text-secondary)]">
              <span className="text-[var(--color-text-primary)]">{data.total}</span> memories ·{' '}
              <span className="text-[var(--color-text-primary)]">{data.projects.length}</span>{' '}
              projects ·{' '}
              <span className="text-[var(--color-text-primary)]">{data.categories.length}</span>{' '}
              categories
            </p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Home: {data.memoryHome} <span className="opacity-60">({data.homeSource})</span>
            </p>
          </section>

          <section className="grid grid-cols-[1fr_2fr] gap-6">
            <div>
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                Projects
              </h2>
              <ul className="space-y-1 text-sm">
                {data.projects.map((p) => (
                  <li
                    key={p.project}
                    className="flex items-center justify-between rounded-sm px-2 py-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]"
                  >
                    <span>{p.project}</span>
                    <span className="text-xs text-[var(--color-text-muted)]">{p.count}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                Recent memories (top 10)
              </h2>
              <ul className="space-y-2 text-sm">
                {data.items.map((m) => (
                  <li
                    key={m.id}
                    className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] p-3"
                  >
                    <p className="text-[var(--color-text-primary)]">{m.title}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--color-text-muted)]">
                      <span>{m.project}</span>
                      <span>·</span>
                      <span>{m.category ?? 'no category'}</span>
                      <span>·</span>
                      <span>{m.updatedAt.slice(0, 10)}</span>
                      <span>·</span>
                      <span>{formatBytes(m.what.length)}</span>
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
