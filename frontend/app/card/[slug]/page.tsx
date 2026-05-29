import type { Metadata } from "next";
import DigitalCardClient from "./DigitalCardClient";

// Force per-request rendering so generateMetadata always runs at request time
export const dynamic = "force-dynamic";

// Internal Docker network URL — used by next.config.mjs rewrites already
const BACKEND_URL = process.env.BACKEND_URL || "http://backend:8000";
// Public site origin for building absolute og:image URLs
const PUBLIC_BASE = "https://ali-axis.maia.com.my";

interface CardData {
  name: string;
  designation?: string;
  company_name?: string;
  phone?: string;
  email?: string;
  photo_url?: string;
  company_logo_url?: string;
}

async function fetchCardMeta(slug: string): Promise<CardData | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/public/card/${slug}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function makeAbsolute(url?: string): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http")) return url;
  return `${PUBLIC_BASE}${url}`;
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const card = await fetchCardMeta(params.slug);
  if (!card) {
    return {
      title: "Digital Card | Ali Axis",
      description: "Ali Axis Business Management System",
    };
  }

  const title = card.designation
    ? `${card.name} — ${card.designation}`
    : card.name;

  const descParts: string[] = [];
  if (card.company_name) descParts.push(card.company_name);
  if (card.phone) descParts.push(card.phone);
  if (card.email) descParts.push(card.email);
  const description = descParts.join(" · ") || "Digital Business Card";

  const imageUrl = makeAbsolute(card.photo_url) ?? makeAbsolute(card.company_logo_url);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "profile",
      ...(imageUrl ? { images: [{ url: imageUrl, width: 400, height: 400 }] } : {}),
    },
    twitter: {
      card: imageUrl ? "summary_large_image" : "summary",
      title,
      description,
      ...(imageUrl ? { images: [imageUrl] } : {}),
    },
  };
}

export default function CardPage({ params }: { params: { slug: string } }) {
  return <DigitalCardClient slug={params.slug} />;
}
