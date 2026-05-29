import { ImageResponse } from "next/og";

export const alt = "Digital Business Card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BACKEND_URL = process.env.BACKEND_URL || "http://backend:8000";
const PUBLIC_BASE = "https://ali-axis.maia.com.my";

interface CardData {
  name: string;
  designation?: string;
  company_name?: string;
  company_logo_url?: string;
  photo_url?: string;
}

function makeAbsolute(url?: string): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http")) return url;
  return `${PUBLIC_BASE}${url}`;
}

export default async function Image({ params }: { params: { slug: string } }) {
  let card: CardData | null = null;
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/public/card/${params.slug}`, {
      cache: "no-store",
    });
    if (res.ok) card = await res.json();
  } catch (_e) {}

  const name = card?.name ?? "Digital Card";
  const designation = card?.designation ?? "";
  const initials = name
    .split(" ")
    .map((w: string) => w[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const photoUrl = makeAbsolute(card?.photo_url);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#1a1a2e",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        {/* Decorative blobs */}
        <div
          style={{
            position: "absolute",
            top: -100,
            right: -100,
            width: 400,
            height: 400,
            borderRadius: "50%",
            background: "rgba(45,212,191,0.12)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -80,
            left: -80,
            width: 320,
            height: 320,
            borderRadius: "50%",
            background: "rgba(45,212,191,0.07)",
            display: "flex",
          }}
        />

        {/* Content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "28px",
            zIndex: 1,
          }}
        >
          {/* Avatar */}
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              width={180}
              height={180}
              style={{
                borderRadius: "50%",
                objectFit: "cover",
                border: "5px solid rgba(45,212,191,0.6)",
              }}
            />
          ) : (
            <div
              style={{
                width: 180,
                height: 180,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #14b8a6, #0d9488)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "5px solid rgba(45,212,191,0.4)",
              }}
            >
              <span style={{ color: "white", fontSize: 72, fontWeight: 700 }}>
                {initials}
              </span>
            </div>
          )}

          {/* Name & designation */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <span
              style={{
                color: "white",
                fontSize: 60,
                fontWeight: 700,
                textAlign: "center",
                lineHeight: 1.1,
              }}
            >
              {name}
            </span>
            {designation && (
              <span
                style={{
                  color: "#2dd4bf",
                  fontSize: 32,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "3px",
                }}
              >
                {designation}
              </span>
            )}
          </div>

          {/* Company name */}
          {card?.company_name && (
            <span
              style={{
                color: "rgba(255,255,255,0.45)",
                fontSize: 26,
                marginTop: 4,
              }}
            >
              {card.company_name}
            </span>
          )}
        </div>
      </div>
    ),
    { ...size }
  );
}
