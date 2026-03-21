function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-surface/80 ${className ?? ''}`} />;
}

export default function HisseLoading() {
  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-32 rounded-full" />
        </div>

        {/* Timeframe tabs */}
        <div className="mb-4 flex gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-9 w-14 rounded-md" />
          ))}
        </div>

        {/* Chart placeholder */}
        <Skeleton className="mb-6 h-[400px] w-full rounded-lg" />

        {/* Signals section */}
        <div className="space-y-4">
          <Skeleton className="h-6 w-28" />
          {[1, 2].map((i) => (
            <div key={i} className="rounded-lg border border-border bg-surface/80 p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-5 w-16" />
              </div>
              <Skeleton className="mt-3 h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-3/4" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
