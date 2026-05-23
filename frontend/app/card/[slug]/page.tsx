"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import QRCode from "react-qr-code";
import { nameCardApi, CardData } from "@/lib/api";

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M1.5 4.5a3 3 0 0 1 3-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 0 1-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 0 0 6.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 0 1 1.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 0 1-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5Z" clipRule="evenodd" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M1.5 8.67v8.58a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3V8.67l-8.928 5.493a3 3 0 0 1-3.144 0L1.5 8.67Z" />
      <path d="M22.5 6.908V6.75a3 3 0 0 0-3-3h-15a3 3 0 0 0-3 3v.158l9.714 5.978a1.5 1.5 0 0 0 1.572 0L22.5 6.908Z" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M21.721 12.752a9.711 9.711 0 0 0-.945-5.003 12.754 12.754 0 0 1-4.339 2.708 18.991 18.991 0 0 1-.214 4.772 17.165 17.165 0 0 0 5.498-2.477ZM14.634 15.55a17.324 17.324 0 0 0 .332-4.647c-.952.227-1.945.347-2.966.347-1.021 0-2.014-.12-2.966-.347a17.515 17.515 0 0 0 .332 4.647 17.385 17.385 0 0 0 5.268 0ZM9.772 17.119a18.963 18.963 0 0 0 4.456 0A17.182 17.182 0 0 1 12 21.724a17.18 17.18 0 0 1-2.228-4.605ZM7.777 15.23a18.87 18.87 0 0 1-.214-4.774 12.753 12.753 0 0 1-4.34-2.708 9.711 9.711 0 0 0-.944 5.004 17.165 17.165 0 0 0 5.498 2.477ZM21.356 14.752a9.765 9.765 0 0 1-7.478 6.817 18.64 18.64 0 0 0 1.988-4.718 18.627 18.627 0 0 0 5.49-2.098ZM2.644 14.752c1.682.971 3.53 1.688 5.49 2.099a18.64 18.64 0 0 0 1.988 4.718 9.765 9.765 0 0 1-7.478-6.816ZM13.878 2.43a9.755 9.755 0 0 1 6.116 3.986 11.267 11.267 0 0 1-3.746 2.504 18.63 18.63 0 0 0-2.37-6.49ZM12 2.276a17.152 17.152 0 0 1 2.805 7.121c-.897.23-1.837.353-2.805.353-.968 0-1.908-.122-2.805-.353A17.151 17.151 0 0 1 12 2.276ZM10.122 2.43a18.629 18.629 0 0 0-2.37 6.49 11.266 11.266 0 0 1-3.746-2.504 9.754 9.754 0 0 1 6.116-3.985Z" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="m11.54 22.351.07.04.028.016a.76.76 0 0 0 .723 0l.028-.015.071-.041a16.975 16.975 0 0 0 1.144-.742 19.58 19.58 0 0 0 2.683-2.282c1.944-2.013 3.5-4.667 3.5-8.077 0-3.866-3.134-7-7-7-3.866 0-7 3.134-7 7 0 3.41 1.556 6.064 3.5 8.077a19.58 19.58 0 0 0 2.683 2.282 16.974 16.974 0 0 0 1.144.742ZM12 13.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

export default function DigitalCardPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [card, setCard] = useState<CardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [cardUrl, setCardUrl] = useState("");

  useEffect(() => {
    setCardUrl(window.location.href);
    nameCardApi.getPublicCard(slug)
      .then(setCard)
      .catch(() => setCard(null))
      .finally(() => setLoading(false));
  }, [slug]);

  const copyLink = useCallback(async () => {
    await navigator.clipboard.writeText(cardUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [cardUrl]);

  const downloadVCard = useCallback(() => {
    if (!card) return;
    const phone = card.phone?.replace(/\D/g, "") ?? "";
    const lines = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `FN:${card.name}`,
      card.designation ? `TITLE:${card.designation}` : "",
      card.company_name ? `ORG:${card.company_name}` : "",
      phone ? `TEL;TYPE=CELL:${phone}` : "",
      card.email ? `EMAIL:${card.email}` : "",
      card.company_website ? `URL:${card.company_website}` : "",
      card.company_address ? `ADR:;;${card.company_address};;;;` : "",
      "END:VCARD",
    ].filter(Boolean).join("\r\n");

    const blob = new Blob([lines], { type: "text/vcard" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${card.name.replace(/\s+/g, "_")}.vcf`;
    a.click();
    URL.revokeObjectURL(url);
  }, [card]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!card) {
    return (
      <div className="min-h-screen bg-[#0f0f1a] flex flex-col items-center justify-center text-white gap-3">
        <p className="text-2xl font-semibold">Card not found</p>
        <p className="text-white/40 text-sm">This digital card link may be invalid or has been removed.</p>
      </div>
    );
  }

  const whatsappUrl = card.phone
    ? `https://wa.me/${card.phone.replace(/\D/g, "")}`
    : null;

  const initials = card.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen bg-[#0f0f1a] flex flex-col items-center justify-center p-4 font-sans">
      {/* Card container */}
      <div className="w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl shadow-black/60">

        {/* ── Top panel — dark navy with teal wave ── */}
        <div className="relative bg-[#1a1a2e] px-7 pt-8 pb-16 text-white overflow-hidden">
          {/* Background wave shapes */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-teal-500/10" />
            <div className="absolute -bottom-10 -left-10 w-48 h-48 rounded-full bg-teal-400/8" />
          </div>

          {/* Company logo + name */}
          <div className="relative flex items-center gap-3 mb-8">
            {card.company_logo_url ? (
              <img
                src={card.company_logo_url}
                alt={card.company_name ?? ""}
                className="h-8 w-auto max-w-[120px] object-contain brightness-200"
              />
            ) : (
              <span className="text-teal-400 font-bold text-lg tracking-wide">
                {card.company_name ?? ""}
              </span>
            )}
          </div>

          {/* Avatar */}
          <div className="relative flex justify-center mb-5">
            <div className="relative">
              {card.photo_url ? (
                <img
                  src={card.photo_url}
                  alt={card.name}
                  className="w-24 h-24 rounded-full object-cover border-4 border-teal-400/60 shadow-lg"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center border-4 border-teal-400/40 shadow-lg">
                  <span className="text-white text-2xl font-bold">{initials}</span>
                </div>
              )}
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-teal-400 rounded-full border-2 border-[#1a1a2e]" />
            </div>
          </div>

          {/* Name + designation */}
          <div className="relative text-center">
            <h1 className="text-xl font-bold text-white leading-tight">{card.name}</h1>
            {card.designation && (
              <p className="text-teal-400 text-sm font-medium mt-1">{card.designation}</p>
            )}
            {card.department && (
              <p className="text-white/40 text-xs mt-0.5">{card.department}</p>
            )}
          </div>
        </div>

        {/* Wave SVG divider */}
        <div className="bg-[#1a1a2e] relative" style={{ marginBottom: "-1px" }}>
          <svg viewBox="0 0 400 40" preserveAspectRatio="none" className="w-full h-10 block">
            <path d="M0,0 C100,40 300,40 400,0 L400,40 L0,40 Z" fill="#f8fafc" />
          </svg>
        </div>

        {/* ── Bottom panel — white ── */}
        <div className="bg-white px-7 pt-5 pb-7">

          {/* Contact rows */}
          <div className="space-y-3 mb-6">
            {card.phone && (
              <a
                href={whatsappUrl ?? `tel:${card.phone}`}
                target={whatsappUrl ? "_blank" : undefined}
                rel="noreferrer"
                className="flex items-center gap-3 text-sm text-gray-700 hover:text-teal-600 transition-colors group"
              >
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-teal-50 group-hover:bg-teal-100 flex items-center justify-center text-teal-600 transition-colors">
                  {whatsappUrl ? <WhatsAppIcon /> : <PhoneIcon />}
                </span>
                <span>{card.phone}</span>
              </a>
            )}
            {card.email && (
              <a
                href={`mailto:${card.email}`}
                className="flex items-center gap-3 text-sm text-gray-700 hover:text-teal-600 transition-colors group"
              >
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-teal-50 group-hover:bg-teal-100 flex items-center justify-center text-teal-600 transition-colors">
                  <MailIcon />
                </span>
                <span className="truncate">{card.email}</span>
              </a>
            )}
            {card.company_website && (
              <a
                href={card.company_website}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 text-sm text-gray-700 hover:text-teal-600 transition-colors group"
              >
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-teal-50 group-hover:bg-teal-100 flex items-center justify-center text-teal-600 transition-colors">
                  <GlobeIcon />
                </span>
                <span>{card.company_website.replace(/^https?:\/\//, "")}</span>
              </a>
            )}
            {card.company_address && (
              <div className="flex items-start gap-3 text-sm text-gray-500">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 mt-0.5">
                  <MapPinIcon />
                </span>
                <span className="leading-snug">{card.company_address}</span>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-gray-100 mb-5" />

          {/* QR code + actions row */}
          <div className="flex items-end justify-between gap-4">
            {/* QR code */}
            <div className="p-2 bg-white border border-gray-100 rounded-xl shadow-sm">
              <QRCode value={cardUrl || `https://ali-axis.lightningcloud.my/card/${slug}`} size={80} />
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2 flex-1">
              <button
                onClick={downloadVCard}
                className="w-full py-2.5 rounded-xl bg-[#1a1a2e] text-white text-sm font-medium hover:bg-[#252540] transition-colors"
              >
                Save Contact
              </button>
              <button
                onClick={copyLink}
                className="w-full py-2.5 rounded-xl border border-teal-200 bg-teal-50 text-teal-700 text-sm font-medium hover:bg-teal-100 transition-colors flex items-center justify-center gap-1.5"
              >
                <ShareIcon />
                {copied ? "Copied!" : "Share"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <p className="mt-6 text-white/20 text-xs">Powered by Ali Axis BMS</p>
    </div>
  );
}
