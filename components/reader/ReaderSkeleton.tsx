/** Static shell shown for a moment while the client reader loads saved progress. */
export function ReaderSkeleton({ title }: { title: string }) {
  return (
    <div className="flex min-h-dvh flex-col bg-paper" aria-busy="true">
      <div className="h-14 border-b border-line px-4 py-2 text-center">
        <p className="font-display font-semibold">{title}</p>
      </div>
      <div className="flex-1 px-3 py-6 sm:px-6 sm:py-10">
        <div className="paper-grain mx-auto h-[70dvh] max-w-[48rem] rounded-[var(--radius-card)] bg-card shadow-[var(--shadow-page)] ring-1 ring-line">
          <span className="sr-only">Opening your book…</span>
        </div>
      </div>
    </div>
  );
}
