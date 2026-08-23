import type { Metadata } from "next";
import { AccountBootstrap } from "@/features/account/AccountBootstrap";
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
    <html lang="en">
      <body>
        <AccountBootstrap />
        {children}
      </body>
    </html>
  );
}
