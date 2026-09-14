import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "Apna Hostel · Fee portal", template: "%s · Apna Hostel" },
  description:
    "Your hostel fees, made simple. Pay securely and track your receipts.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#28654c",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:bg-white focus:p-4"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
