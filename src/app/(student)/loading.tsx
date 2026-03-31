export default function StudentLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-8 w-56 rounded-lg bg-muted" />
        <div className="h-4 w-80 rounded-lg bg-muted" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="space-y-3 rounded-xl border p-4">
            <div className="aspect-video rounded-lg bg-muted" />
            <div className="h-5 w-2/3 rounded-lg bg-muted" />
            <div className="h-4 w-full rounded-lg bg-muted" />
            <div className="h-4 w-4/5 rounded-lg bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
