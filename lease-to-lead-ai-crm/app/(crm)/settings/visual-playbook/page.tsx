import dynamic from "next/dynamic";

const VisualPlaybookBuilder = dynamic(() => import("@/components/visual-playbook/VisualPlaybookBuilder"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[50vh] items-center justify-center text-sm text-slate/60">Loading builder…</div>
  )
});

export default function VisualPlaybookPage() {
  return (
    <div className="min-h-[calc(100dvh-5rem)] px-4 py-4 sm:px-6">
      <VisualPlaybookBuilder />
    </div>
  );
}
