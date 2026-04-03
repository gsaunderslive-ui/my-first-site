import "./globals.css";
import { ReactNode } from "react";

export const metadata = {
  title: "Lease-to-Lead AI CRM",
  description: "Demo CRM for converting tenants to buyers"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
