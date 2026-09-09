import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Tamil } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const tamil = Noto_Sans_Tamil({
  subsets: ["tamil"],
  variable: "--font-tamil",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "VARUNA — India's Smartest Marine Intelligence",
    template: "%s | VARUNA",
  },
  description:
    "Real-time fishing zone detection, safety advisories & IMBL alerts for 8.6 million Indian fishermen — in Tamil, on WhatsApp.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "VARUNA" },
};

export const viewport: Viewport = {
  themeColor: "#03045E",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${tamil.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
