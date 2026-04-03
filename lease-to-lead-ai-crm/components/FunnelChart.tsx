import { Stage } from "@/lib/types";

export function FunnelChart({ funnel }: { funnel: Record<Stage, number> }) {
  const entries = Object.entries(funnel) as [Stage, number][];
  const max = Math.max(...entries.map(([, value]) => value), 1);

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-soft">
      <h3 className="text-lg font-semibold text-slate">Tenant -&gt; Buyer Conversion Funnel</h3>
      <div className="mt-5 space-y-3">
        {entries.map(([stage, value]) => (
          <div key={stage}>
            <div className="mb-1 flex items-center justify-between text-sm text-slate/70">
              <span>{stage}</span>
              <span>{value}</span>
            </div>
            <div className="h-3 rounded-full bg-mist">
              <div
                className="h-3 rounded-full bg-gradient-to-r from-mint to-coral transition-all"
                style={{ width: `${(value / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
