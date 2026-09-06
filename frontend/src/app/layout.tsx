import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VARUNA MOS | Marine Operational System",
  description: "Marine decision support for coastal Tamil Nadu - SIH26176",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-navy-950 text-slate-200 antialiased">
        {children}
      </body>
    </html>
  );
}
