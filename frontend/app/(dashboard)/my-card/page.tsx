"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import QRCode from "react-qr-code";
import { nameCardApi, CardSummary, CardCreate } from "@/lib/api";

const EMPTY_FORM: CardCreate = { title: "", name: "", designation: "", phone: "", email: "", photo_url: "" };

export default function MyCardPage() {
  const qc = useQueryClient();
  const [origin, setOrigin] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [mode, setMode] = useState<"list" | "add" | "edit">("list");
  const [editingCard, setEditingCard] = useState<CardSummary | null>(null);
  const [form, setForm] = useState<CardCreate>(EMPTY_FORM);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [previewCard, setPreviewCard] = useState<CardSummary | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setOrigin(window.location.origin); }, []);

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ["my-cards"],
    queryFn: nameCardApi.listMyCards,
  });

  const createMut = useMutation({
    mutationFn: nameCardApi.createCard,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["my-cards"] }); setMode("list"); setForm(EMPTY_FORM); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: CardCreate }) => nameCardApi.updateCard(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["my-cards"] }); setMode("list"); setEditingCard(null); setForm(EMPTY_FORM); },
  });

  const deleteMut = useMutation({
    mutationFn: nameCardApi.deleteCard,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-cards"] }),
  });

  const regenMut = useMutation({
    mutationFn: nameCardApi.regenerateCardSlug,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-cards"] }),
  });

  const copyLink = async (card: CardSummary) => {
    await navigator.clipboard.writeText(`${origin}/card/${card.slug}`);
    setCopiedId(card.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const openEdit = (card: CardSummary) => {
    setEditingCard(card);
    setForm({ title: card.title ?? "", name: card.name ?? "", designation: card.designation ?? "", phone: card.phone ?? "", email: card.email ?? "", photo_url: card.photo_url ?? "" });
    setMode("edit");
    setPreviewCard(null);
  };

  const openAdd = () => {
    setEditingCard(null);
    setForm(EMPTY_FORM);
    setMode("add");
    setPreviewCard(null);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoUploading(true);
    try {
      const res = await nameCardApi.uploadPhoto(file);
      setForm((f) => ({ ...f, photo_url: res.photo_url }));
    } catch {
      alert("Photo upload failed.");
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleSubmit = () => {
    const payload: CardCreate = {
      title: form.title || undefined,
      name: form.name || undefined,
      designation: form.designation || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
      photo_url: form.photo_url || undefined,
    };
    if (mode === "edit" && editingCard) {
      updateMut.mutate({ id: editingCard.id, data: payload });
    } else {
      createMut.mutate(payload);
    }
  };

  const isSaving = createMut.isPending || updateMut.isPending;

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Name Cards</h1>
          <p className="text-default-400 text-sm mt-0.5">Each card has its own shareable link and QR code.</p>
        </div>
        {mode === "list" && (
          <button
            onClick={openAdd}
            className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            + Add Card
          </button>
        )}
      </div>

      {/* Add / Edit Form */}
      {mode !== "list" && (
        <div className="bg-default-50 border border-default-200 rounded-2xl p-5 mb-6 space-y-4">
          <h2 className="font-semibold text-foreground text-base">
            {mode === "add" ? "New Card" : "Edit Card"}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-default-500 uppercase tracking-wider block mb-1">Card Label (optional)</label>
              <input
                value={form.title ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder='e.g. "MAIA Card", "Freelance Card"'
                className="w-full text-sm border border-default-200 rounded-lg px-3 py-2 bg-white outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-default-500 uppercase tracking-wider block mb-1">Name</label>
              <input
                value={form.name ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={editingCard?.is_default ? "Auto from employee profile" : "Full name"}
                className="w-full text-sm border border-default-200 rounded-lg px-3 py-2 bg-white outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-default-500 uppercase tracking-wider block mb-1">Designation</label>
              <input
                value={form.designation ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))}
                placeholder={editingCard?.is_default ? "Auto from employee profile" : "e.g. Software Engineer"}
                className="w-full text-sm border border-default-200 rounded-lg px-3 py-2 bg-white outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-default-500 uppercase tracking-wider block mb-1">Phone / WhatsApp</label>
              <input
                value={form.phone ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder={editingCard?.is_default ? "Auto from employee profile" : "e.g. 0149309413"}
                className="w-full text-sm border border-default-200 rounded-lg px-3 py-2 bg-white outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-default-500 uppercase tracking-wider block mb-1">Email</label>
              <input
                value={form.email ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder={editingCard?.is_default ? "Auto from account email" : "you@example.com"}
                className="w-full text-sm border border-default-200 rounded-lg px-3 py-2 bg-white outline-none focus:border-primary"
              />
            </div>

            {/* Photo upload */}
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-default-500 uppercase tracking-wider block mb-1">Photo</label>
              <div className="flex items-center gap-3">
                {form.photo_url ? (
                  <img src={form.photo_url} alt="preview" className="w-12 h-12 rounded-full object-cover border border-default-200" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-default-100 border border-default-200 flex items-center justify-center text-default-400 text-xs">None</div>
                )}
                <button
                  type="button"
                  onClick={() => photoRef.current?.click()}
                  disabled={photoUploading}
                  className="px-3 py-1.5 text-sm border border-default-200 rounded-lg bg-white hover:bg-default-50 transition-colors disabled:opacity-50"
                >
                  {photoUploading ? "Uploading…" : "Upload Photo"}
                </button>
                {form.photo_url && (
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, photo_url: "" }))}
                    className="text-xs text-danger-500 hover:underline"
                  >
                    Remove
                  </button>
                )}
                <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
              </div>
              {editingCard?.is_default && !form.photo_url && (
                <p className="text-xs text-default-400 mt-1">Auto from employee profile if empty.</p>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={() => { setMode("list"); setEditingCard(null); setForm(EMPTY_FORM); }}
              className="flex-1 py-2.5 rounded-xl border border-default-200 text-sm font-medium text-default-600 hover:bg-default-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSaving}
              className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isSaving ? "Saving…" : "Save Card"}
            </button>
          </div>
        </div>
      )}

      {/* Cards list */}
      <div className="space-y-3">
        {cards.map((card) => {
          const cardUrl = `${origin}/card/${card.slug}`;
          const isQROpen = previewCard?.id === card.id;

          return (
            <div key={card.id} className="bg-white border border-default-200 rounded-2xl p-4 shadow-sm">
              {/* Title row */}
              <div className="flex items-center gap-2 mb-3">
                <span className="font-medium text-foreground text-sm">
                  {card.title || (card.is_default ? "Default Card" : `Card #${card.id}`)}
                </span>
                {card.is_default && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">Default</span>
                )}
              </div>

              {/* Link row */}
              <div className="flex items-center gap-2 mb-3">
                <input
                  readOnly
                  value={cardUrl}
                  className="flex-1 text-xs bg-default-50 border border-default-200 rounded-lg px-3 py-1.5 text-default-600 truncate outline-none"
                />
                <button
                  onClick={() => copyLink(card)}
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors"
                >
                  {copiedId === card.id ? "Copied!" : "Copy"}
                </button>
              </div>

              {/* Actions row */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setPreviewCard(isQROpen ? null : card)}
                  className="px-3 py-1.5 rounded-lg border border-default-200 text-xs font-medium text-default-600 hover:bg-default-50 transition-colors"
                >
                  {isQROpen ? "Hide QR" : "Show QR"}
                </button>
                <a
                  href={cardUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg border border-default-200 text-xs font-medium text-default-600 hover:bg-default-50 transition-colors"
                >
                  Preview
                </a>
                <button
                  onClick={() => openEdit(card)}
                  className="px-3 py-1.5 rounded-lg border border-default-200 text-xs font-medium text-default-600 hover:bg-default-50 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => {
                    if (confirm("Generate a new link? The old link will stop working.")) {
                      regenMut.mutate(card.id);
                    }
                  }}
                  disabled={regenMut.isPending}
                  className="px-3 py-1.5 rounded-lg border border-default-200 text-xs font-medium text-default-600 hover:bg-default-50 transition-colors disabled:opacity-50"
                >
                  New Link
                </button>
                {!card.is_default && (
                  <button
                    onClick={() => {
                      if (confirm("Delete this card? This cannot be undone.")) {
                        deleteMut.mutate(card.id);
                      }
                    }}
                    disabled={deleteMut.isPending}
                    className="px-3 py-1.5 rounded-lg border border-danger-200 text-xs font-medium text-danger-500 hover:bg-danger-50 transition-colors disabled:opacity-50"
                  >
                    Delete
                  </button>
                )}
              </div>

              {/* QR panel */}
              {isQROpen && cardUrl && (
                <div className="mt-4 flex flex-col items-center gap-2 pt-4 border-t border-default-100">
                  <div className="p-3 bg-white border border-default-100 rounded-xl shadow-sm">
                    <QRCode value={cardUrl} size={140} />
                  </div>
                  <p className="text-xs text-default-400">Scan to open card</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {cards.length === 0 && mode === "list" && (
        <div className="text-center py-12 text-default-400 text-sm">No cards yet. Click "Add Card" to get started.</div>
      )}

      <p className="text-xs text-default-400 text-center mt-6">
        Default card info comes from your employee profile. Manual cards let you set any info.
      </p>
    </div>
  );
}
