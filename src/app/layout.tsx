import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Toaster } from "sonner";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Inter, Noto_Sans_Devanagari, Noto_Sans_Gujarati } from "next/font/google";
import { ServiceWorkerRegistrar } from "@/components/notifications/ServiceWorkerRegistrar";
import { PwaInstallPrompt } from "@/components/pwa/PwaInstallPrompt";
import { OfflineBanner } from "@/components/pwa/OfflineBanner";
import { THEME_COOKIE_NAME } from "@/lib/theme";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const notoSansGujarati = Noto_Sans_Gujarati({
  subsets: ["gujarati"],
  variable: "--font-noto-sans-gujarati",
  display: "swap",
});

const notoSansDevanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  variable: "--font-noto-sans-devanagari",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#4f46e5",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: "Entrivo — Modern Workplace Visitor Management Platform",
  description: "Enterprise visitor registration, QR check-ins, security gate controls, and real-time host notifications.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Entrivo",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} data-theme="dark" suppressHydrationWarning>
      <head>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(() => {
  const getPreference = () => {
    const savedTheme = document.cookie.match(/(?:^|;\\s*)${THEME_COOKIE_NAME}=(system|light|dark)(?:;|$)/);
    return savedTheme ? savedTheme[1] : "dark";
  };
  const colorScheme = window.matchMedia("(prefers-color-scheme: light)");
  const applyTheme = () => {
    const preference = getPreference();
    const theme = preference === "system" ? (colorScheme.matches ? "light" : "dark") : preference;
    document.documentElement.dataset.theme = theme;
  };
  applyTheme();
  colorScheme.addEventListener("change", applyTheme);
})();`,
          }}
        />
      </head>
      <body className={`${inter.variable} ${notoSansGujarati.variable} ${notoSansDevanagari.variable} min-h-screen bg-background text-text antialiased selection:bg-brand selection:text-white`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ServiceWorkerRegistrar />
          <OfflineBanner />
          <PwaInstallPrompt />
          {children}
          <Toaster richColors position="top-right" theme="dark" closeButton />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
