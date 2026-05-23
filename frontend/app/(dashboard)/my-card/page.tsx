"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import QRCode from "react-qr-code";
import { nameCardApi } from "@/lib/api";

export default function MyCardPage() {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const { data: slugData, isLoading } = useQuery({
    queryKey: ["my-card-slug"],
    queryFn: nameCardApi.getMySlug,
  });

  const regenerate = useMutation({
    mutationFn: nameCardApi.regenerateSlug,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-card-slug"] }),
  });

  const cardUrl = slugData ? `${origin}/card/${slugData.card_slug}` : "";

  const copyLink = async () => {
    if (!cardUrl) return;
    await navigator.clipboard.writeText(cardUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-6 max-w-xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">My Digital Card</h1>
        <p className="text-default-400 text-sm mt-1">
          Share your personal digital name card — anyone with the link can view it without logging in.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Card URL */}
          <div className="bg-default-50 rounded-xl p-4 border border-default-200">
            <p className="text-xs text-default-400 mb-2 font-medium uppercase tracking-wider">Your card link</p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={cardUrl}
                className="flex-1 text-sm bg-white border border-default-200 rounded-lg px-3 py-2 text-default-700 truncate outline-none"
              />
              <button
                onClick={copyLink}
                className="shrink-0 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          {/* QR Code */}
          {cardUrl && (
            <div className="flex flex-col items-center gap-3 bg-white border border-default-200 rounded-xl p-6">
              <p className="text-sm text-default-500 font-medium">Scan to open card</p>
              <div className="p-3 bg-white rounded-xl border border-default-100 shadow-sm">
                <QRCode value={cardUrl} size={160} />
              </div>
              <p className="text-xs text-default-400 text-center">
                Share this QR code on presentations, email signatures, or print it on your physical card.
              </p>
            </div>
          )}

          {/* Preview + regenerate */}
          <div className="flex gap-3">
            <a
              href={cardUrl}
              target="_blank"
              rel="noreferrer"
              className="flex-1 py-2.5 rounded-xl border border-default-200 text-sm font-medium text-center text-default-700 hover:bg-default-50 transition-colors"
            >
              Preview Card
            </a>
            <button
              onClick={() => {
                if (confirm("This will change your card link. Your old link will stop working. Continue?")) {
                  regenerate.mutate();
                }
              }}
              disabled={regenerate.isPending}
              className="flex-1 py-2.5 rounded-xl border border-danger-200 text-sm font-medium text-danger-500 hover:bg-danger-50 transition-colors disabled:opacity-50"
            >
              {regenerate.isPending ? "Regenerating…" : "New Link"}
            </button>
          </div>

          <p className="text-xs text-default-400 text-center">
            Card info is pulled from your employee profile. Update your profile to change what appears on the card.
          </p>
        </div>
      )}
    </div>
  );
}
