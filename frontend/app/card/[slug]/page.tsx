import type { Metadata } from "next";
import DigitalCardClient from "./DigitalCardClient";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
const STATIC_BASE = API_URL.replace(/\/api\/v1\/?$/, "");

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
    const res = await fetch(`${API_URL}/public/card/${slug}`, {
      next: { revalidate: 60 },
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
  return `${STATIC_BASE}${url}`;
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
