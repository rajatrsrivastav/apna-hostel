export default function Loading() {
  return (
    <div aria-busy="true" className="space-y-5">
      <p className="text-sm text-muted-foreground" role="status">
        Loading / लोड हो रहा है…
      </p>
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-32 animate-pulse rounded-2xl bg-border/60" />
      ))}
    </div>
  );
}
