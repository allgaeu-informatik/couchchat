import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CouchChat Admin",
  description: "Benutzerverwaltung für CouchChat",
  robots: { index: false, follow: false },
  icons: { icon: [{ url: "/images/favicon.png", sizes: "32x32", type: "image/png" }, { url: "/images/favicon.ico" }] },
};

export const viewport: Viewport = { themeColor: "#16222f", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
