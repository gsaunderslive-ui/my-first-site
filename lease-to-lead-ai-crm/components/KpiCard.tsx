export function KpiCard({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <div className="animate-riseIn rounded-2xl border border-slate-100 bg-white p-5 shadow-soft">
      <p className="text-xs uppercase tracking-[0.2em] text-slate/50">{title}</p>
      <p className="mt-3 text-3xl font-semibold text-slate">{value}</p>
      <p className="mt-2 text-sm text-slate/60">{hint}</p>
    </div>
  );
}
