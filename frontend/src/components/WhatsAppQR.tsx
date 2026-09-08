"use client";

import { QRCodeSVG } from "qrcode.react";
import { MessageSquare, ExternalLink } from "lucide-react";

export type WhatsAppQRProps = {
  phoneNumber?: string;
  joinCode?: string;
  size?: number;
  showLink?: boolean;
  className?: string;
};

export function WhatsAppQR({
  phoneNumber = "+14155238886",
  joinCode = "join varuna",
  size = 110,
  showLink = true,
  className = "",
}: WhatsAppQRProps) {
  // Clean phone number for wa.me URL
  const cleanPhone = phoneNumber.replace(/[^0-9]/g, "");
  const encodedMsg = encodeURIComponent(joinCode);
  const waUrl = `https://wa.me/${cleanPhone}?text=${encodedMsg}`;

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <div className="relative rounded-xl bg-white p-2.5 shadow-xl transition-transform hover:scale-105">
        <QRCodeSVG
          value={waUrl}
          size={size}
          level="H"
          includeMargin={false}
          imageSettings={{
            src: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2325D366'><path d='M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z'/></svg>",
            x: undefined,
            y: undefined,
            height: Math.round(size * 0.22),
            width: Math.round(size * 0.22),
            excavate: true,
          }}
        />
      </div>
      {showLink && (
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 hover:underline transition"
        >
          <span>Open WhatsApp Web</span>
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

export default WhatsAppQR;
