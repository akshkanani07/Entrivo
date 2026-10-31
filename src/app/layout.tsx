import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Entrivo — Modern Workplace Visitor Management Platform",
  description: "Enterprise visitor registration, QR check-ins, security gate controls, and real-time host notifications.",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#080c14] text-slate-100 antialiased selection:bg-indigo-600 selection:text-white">
        {children}
        <Toaster richColors position="top-right" theme="dark" closeButton />
      </body>
    </html>
  );
}
