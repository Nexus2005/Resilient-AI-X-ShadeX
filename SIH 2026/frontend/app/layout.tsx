import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Resilient AI X ShadeX — Document intake for AICTE applications",
  description:
    "Module 1 intake gateway: validate, normalize, classify and reconcile AICTE application document bundles with evidence-first processing.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-[#F4F6FB] text-[#1F2A44] antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
