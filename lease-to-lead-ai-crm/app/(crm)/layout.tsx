import { ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { TabCloseLogout } from "@/components/TabCloseLogout";

export default function CrmLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen min-w-0 lg:flex">
      <TabCloseLogout />
      <Sidebar />
      <main className="min-w-0 max-w-full flex-1 overflow-x-hidden px-4 py-6 sm:px-8">{children}</main>
    </div>
  );
}
