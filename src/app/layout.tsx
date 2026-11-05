import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { connection } from "next/server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Agenda", template: "%s · Agenda" },
  description: "Agenda de consultórios com Google Agenda e lembretes por WhatsApp",
  // The PWA on iOS, which reads this instead of the manifest (D-76).
  appleWebApp: { capable: true, title: "Agenda", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#0F766E" };

// Every page is rendered per request, the public ones too: the nonce of the security policy
// comes with the request, and a page built ahead of time would have scripts without it (D-102).
export default async function RootLayout({ children }: LayoutProps<"/">) {
  await connection();
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
