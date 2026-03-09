"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button, Input, Select, SelectItem, Textarea, Modal, ModalContent,
  ModalHeader, ModalBody, ModalFooter, Chip,
} from "@heroui/react";
import { Plus, UserCheck, Trash2, Edit2 } from "lucide-react";
import { prospectsApi } from "@/lib/api";
import { Topbar } from "@/components/ui/Topbar";
import { formatCurrency } from "@/lib/utils";

const STAGES = [
  { key: "lead",        label: "Lead",        color: "default"   },
  { key: "qualified",   label: "Qualified",   color: "primary"   },
  { key: "proposal",    label: "Proposal",    color: "secondary" },
  { key: "negotiation", label: "Negotiation", color: "warning"   },
  { key: "won",         label: "Won",         color: "success"   },
  { key: "lost",        label: "Lost",        color: "danger"    },
] as const;

const SOURCES = [
  "referral", "website", "social_media", "cold_call", "exhibition", "existing_client", "other",
];

type StageKey = typeof STAGES[number]["key"];

interface Prospect {
  id: number;
  company_name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  stage: StageKey;
  expected_value: number | null;
  currency: string;
  source: string | null;
  probability: number | null;
  notes: string | null;
  lost_reason: string | null;
  is_converted: boolean;
  converted_client_id: number | null;
  expected_close_date: string | null;
}

const EMPTY_FORM = {
  company_name: "", contact_person: "", email: "", phone: "", address: "",
  stage: "lead" as StageKey, expected_value: "", currency: "MYR",
  source: "", expected_close_date: "", probability: "", notes: "",
};

const stageColor = (s: string) => STAGES.find((x) => x.key === s)?.color ?? "default";
const stageLabel = (s: string) => STAGES.find((x) => x.key === s)?.label ?? s;

export default function PipelinePage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editProspect, setEditProspect] = useState<Prospect | null>(null);
  const [lostModal, setLostModal] = useState<Prospect | null>(null);
  const [lostReason, setLostReason] = useState("");
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");

  const { data: prospects = [] } = useQuery<Prospect[]>({
    queryKey: ["prospects"],
    queryFn: () => prospectsApi.list(),
  });

  const { data: summary } = useQuery({
    queryKey: ["prospects-summary"],
    queryFn: () => prospectsApi.summary(),
  });

  const createMutation = useMutation({
    mutationFn: () => prospectsApi.create({
      ...form,
      expected_value: form.expected_value ? Number(form.expected_value) : null,
      probability: form.probability ? Number(form.probability) : null,
      source: form.source || null,
      expected_close_date: form.expected_close_date || null,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["prospects"] }); queryClient.invalidateQueries({ queryKey: ["prospects-summary"] }); closeModal(); },
    onError: (e: any) => setError(e?.response?.data?.detail || "Failed to save"),
  });

  const updateMutation = useMutation({
    mutationFn: (data: object) => prospectsApi.update(editProspect!.id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["prospects"] }); queryClient.invalidateQueries({ queryKey: ["prospects-summary"] }); closeModal(); },
    onError: (e: any) => setError(e?.response?.data?.detail || "Failed to save"),
  });

  const stageMutation = useMutation({
    mutationFn: ({ id, stage, lost_reason }: { id: number; stage: string; lost_reason?: string }) =>
      prospectsApi.update(id, { stage, ...(lost_reason ? { lost_reason } : {}) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["prospects"] }); queryClient.invalidateQueries({ queryKey: ["prospects-summary"] }); },
  });

  const convertMutation = useMutation({
    mutationFn: (id: number) => prospectsApi.convert(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["prospects"] }); alert("Prospect converted to client successfully!"); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => prospectsApi.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["prospects"] }); queryClient.invalidateQueries({ queryKey: ["prospects-summary"] }); },
  });

  const openCreate = () => { setEditProspect(null); setForm({ ...EMPTY_FORM }); setError(""); setModalOpen(true); };
  const openEdit = (p: Prospect) => {
    setEditProspect(p);
    setForm({
      company_name: p.company_name, contact_person: p.contact_person || "",
      email: p.email || "", phone: p.phone || "", address: "",
      stage: p.stage, expected_value: p.expected_value ? String(p.expected_value) : "",
      currency: p.currency, source: p.source || "",
      expected_close_date: p.expected_close_date || "", probability: p.probability ? String(p.probability) : "",
      notes: p.notes || "",
    });
    setError(""); setModalOpen(true);
  };
  const closeModal = () => { setModalOpen(false); setEditProspect(null); setError(""); };

  const f = (field: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [field]: e.target.value }));

  const handleStageChange = (p: Prospect, newStage: string) => {
    if (newStage === "lost") { setLostModal(p); setLostReason(""); return; }
    stageMutation.mutate({ id: p.id, stage: newStage });
  };

  const confirmLost = () => {
    if (!lostModal) return;
    stageMutation.mutate({ id: lostModal.id, stage: "lost", lost_reason: lostReason || undefined });
    setLostModal(null);
  };

  const filtered = prospects.filter((p) => {
    const matchSearch = !search ||
      p.company_name.toLowerCase().includes(search.toLowerCase()) ||
      (p.contact_person || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.email || "").toLowerCase().includes(search.toLowerCase());
    const matchStage = stageFilter === "all" || p.stage === stageFilter;
    return matchSearch && matchStage;
  });

  return (
    <div>
      <Topbar title="CRM Pipeline" />
      <div className="p-4 sm:p-6 space-y-4">

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {STAGES.map((s) => (
              <button
                key={s.key}
                onClick={() => setStageFilter(stageFilter === s.key ? "all" : s.key)}
                className={`text-left rounded-lg border p-3 transition-all ${
                  stageFilter === s.key ? "border-primary bg-primary/5 shadow-sm" : "border-default-200 bg-white hover:border-default-300"
                }`}
              >
                <p className="text-xs text-gray-400 mb-1">{s.label}</p>
                <p className="text-xl font-bold text-gray-800">{summary.by_stage?.[s.key] ?? 0}</p>
                {summary.value_by_stage?.[s.key] > 0 && (
                  <p className="text-xs text-primary mt-0.5">{formatCurrency(summary.value_by_stage[s.key], "MYR")}</p>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Pipeline value bar */}
        {summary && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-default-50 border border-default-200">
            <span className="text-sm text-gray-500">Total Pipeline Value</span>
            <span className="font-semibold text-gray-800 ml-1">{formatCurrency(summary.total_pipeline_value, "MYR")}</span>
            <span className="text-xs text-gray-400 ml-auto">{prospects.length} prospects</span>
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-2 items-center flex-wrap">
            <Input
              placeholder="Search prospects..."
              size="sm" className="w-full sm:w-64" variant="bordered"
              value={search} onChange={(e) => setSearch(e.target.value)}
            />
            {stageFilter !== "all" && (
              <button onClick={() => setStageFilter("all")} className="text-xs text-primary hover:underline">
                Clear filter
              </button>
            )}
          </div>
          <Button color="primary" size="sm" startContent={<Plus size={15} />} onPress={openCreate}>
            Add Prospect
          </Button>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-default-200 overflow-hidden bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-default-200 bg-default-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Company</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Contact</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Stage</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Value</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Prob.</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Close Date</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Source</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default-100">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-gray-400">
                      {search || stageFilter !== "all" ? "No matching prospects." : "No prospects yet. Add your first one."}
                    </td>
                  </tr>
                )}
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-default-50 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-800">{p.company_name}</p>
                        {p.is_converted && (
                          <span className="text-xs text-success">Converted to Client</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-700">{p.contact_person || "—"}</div>
                      <div className="text-xs text-gray-400">{p.email || p.phone || ""}</div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={p.stage}
                        onChange={(e) => handleStageChange(p, e.target.value)}
                        className="text-xs border border-default-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:border-primary cursor-pointer"
                      >
                        {STAGES.map((s) => (
                          <option key={s.key} value={s.key}>{s.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      {p.expected_value
                        ? <span className="font-medium text-primary">{formatCurrency(p.expected_value, p.currency)}</span>
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {p.probability != null ? `${p.probability}%` : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {p.expected_close_date
                        ? new Date(p.expected_close_date).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" })
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-500 capitalize">
                      {p.source ? p.source.replace("_", " ") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {p.stage === "won" && !p.is_converted && (
                          <Button size="sm" variant="flat" color="success" isIconOnly title="Convert to Client"
                            isLoading={convertMutation.isPending} onPress={() => convertMutation.mutate(p.id)}>
                            <UserCheck size={13} />
                          </Button>
                        )}
                        <Button size="sm" variant="light" isIconOnly onPress={() => openEdit(p)}>
                          <Edit2 size={13} />
                        </Button>
                        <Button size="sm" variant="light" color="danger" isIconOnly
                          onPress={() => { if (confirm("Delete this prospect?")) deleteMutation.mutate(p.id); }}>
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add / Edit Modal */}
      <Modal isOpen={modalOpen} onClose={closeModal} size="lg" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>{editProspect ? `Edit — ${editProspect.company_name}` : "Add New Prospect"}</ModalHeader>
          <ModalBody className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input variant="bordered" label="Company Name *" value={form.company_name} onChange={f("company_name")} className="sm:col-span-2" />
              <Input variant="bordered" label="Contact Person" value={form.contact_person} onChange={f("contact_person")} />
              <Input variant="bordered" label="Email" type="email" value={form.email} onChange={f("email")} />
              <Input variant="bordered" label="Phone" value={form.phone} onChange={f("phone")} />
              <Input variant="bordered" label="Expected Close Date" type="date" value={form.expected_close_date} onChange={f("expected_close_date")} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input variant="bordered" label="Expected Value" type="number" step="0.01" value={form.expected_value} onChange={f("expected_value")} />
              <Select variant="bordered" label="Currency" selectedKeys={[form.currency]}
                onSelectionChange={(k) => setForm((p) => ({ ...p, currency: Array.from(k)[0] as string }))}>
                {["MYR","USD","EUR","GBP","SGD"].map((c) => <SelectItem key={c}>{c}</SelectItem>)}
              </Select>
              <Input variant="bordered" label="Probability %" type="number" min="0" max="100" value={form.probability} onChange={f("probability")} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select variant="bordered" label="Stage" selectedKeys={[form.stage]}
                onSelectionChange={(k) => setForm((p) => ({ ...p, stage: Array.from(k)[0] as StageKey }))}>
                {STAGES.map((s) => <SelectItem key={s.key}>{s.label}</SelectItem>)}
              </Select>
              <Select variant="bordered" label="Source" selectedKeys={form.source ? [form.source] : []}
                onSelectionChange={(k) => setForm((p) => ({ ...p, source: Array.from(k)[0] as string || "" }))}>
                {SOURCES.map((s) => <SelectItem key={s} className="capitalize">{s.replace("_", " ")}</SelectItem>)}
              </Select>
            </div>

            <Textarea variant="bordered" label="Notes" value={form.notes} onChange={f("notes")} minRows={2} />
            {error && <p className="text-danger text-sm">{error}</p>}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={closeModal}>Cancel</Button>
            <Button color="primary"
              isLoading={createMutation.isPending || updateMutation.isPending}
              isDisabled={!form.company_name.trim()}
              onPress={() => editProspect ? updateMutation.mutate({
                ...form,
                expected_value: form.expected_value ? Number(form.expected_value) : null,
                probability: form.probability ? Number(form.probability) : null,
                source: form.source || null,
                expected_close_date: form.expected_close_date || null,
              }) : createMutation.mutate()}>
              {editProspect ? "Save Changes" : "Add Prospect"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Lost reason modal */}
      <Modal isOpen={!!lostModal} onClose={() => setLostModal(null)} size="sm">
        <ModalContent>
          <ModalHeader>Mark as Lost</ModalHeader>
          <ModalBody>
            <Textarea variant="bordered" label="Reason (optional)" value={lostReason}
              onChange={(e) => setLostReason(e.target.value)} minRows={2} />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setLostModal(null)}>Cancel</Button>
            <Button color="danger" onPress={confirmLost}>Confirm Lost</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
