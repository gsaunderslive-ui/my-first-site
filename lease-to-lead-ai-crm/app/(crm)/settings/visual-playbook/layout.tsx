import { ReactNode } from "react";

export default function VisualPlaybookLayout({ children }: { children: ReactNode }) {
  return <div className="-mx-4 -my-6 min-h-0 flex-1 sm:-mx-8">{children}</div>;
}
