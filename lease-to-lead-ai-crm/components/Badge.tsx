export function Badge({ label }: { label: string }) {
  const tone =
    label === "Hot"
      ? "bg-coral/15 text-coral"
      : label === "Warm"
      ? "bg-amber/15 text-amber"
      : label === "Converted"
      ? "bg-mint/15 text-mint"
      : "bg-slate/10 text-slate/70";

  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>{label}</span>;
}
