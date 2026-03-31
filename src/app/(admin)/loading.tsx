export default function AdminLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-64 rounded-lg bg-muted" />
      <div className="grid gap-4 lg:grid-cols-[340px_280px_1fr]">
        <div className="space-y-3 rounded-xl border p-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-12 rounded-lg bg-muted" />
          ))}
        </div>
        <div className="space-y-3 rounded-xl border p-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-12 rounded-lg bg-muted" />
          ))}
        </div>
        <div className="space-y-3 rounded-xl border p-4">
          <div className="h-6 w-1/2 rounded-lg bg-muted" />
          <div className="h-32 rounded-xl bg-muted" />
          <div className="h-24 rounded-xl bg-muted" />
          <div className="h-24 rounded-xl bg-muted" />
        </div>
      </div>
    </div>
  );
}
