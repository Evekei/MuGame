import type { Metadata } from "next";
import { AccountBootstrap } from "@/features/account/AccountBootstrap";
import { AppShell } from "@/features/app-shell/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "MuGame",
  description: "Mobile playlist game skeleton"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <AccountBootstrap />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
