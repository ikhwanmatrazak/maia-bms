"use client";
import { Topbar } from "@/components/ui/Topbar";
import { CardGridSkeleton } from "@/components/ui/PageSkeleton";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button, Chip, Input, Select, SelectItem, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure } from "@heroui/react";
import { Plus, Search, FolderOpen, Building2 } from "lucide-react";
import { projectsApi, clientsApi } from "@/lib/api";
import { api } from "@/lib/api";

const PRIORITY_COLORS: Record<string, "default" | "primary" | "warning" | "danger"> = {
  low: "default", medium: "primary", high: "warning", critical: "danger",
};

export default function ProjectsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [search, setSearch] = useState("");
  const [filterStage, setFilterStage] = useState<string>("");

  const { data: stages = [] } = useQuery({ queryKey: ["project-stages"], queryFn: projectsApi.listStages });
  const { data: projects = [], isLoading } = useQuery({ queryKey: ["projects", filterStage], queryFn: () => projectsApi.list(filterStage ? Number(filterStage) : undefined) });
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: () => api.get("/users").then((r) => r.data) });
  const { data: clientsRaw } = useQuery({ queryKey: ["clients-dropdown"], queryFn: () => clientsApi.list() });
  const clients: { id: number; company_name: string }[] = Array.isArray(clientsRaw) ? clientsRaw : [];

  const [form, setForm] = useState({ name: "", description: "", stage_id: "", client_id: "", priority: "medium", start_date: "", end_date: "", budget: "", member_ids: "" });

  const createMutation = useMutation({
    mutationFn: () => projectsApi.create({ ...form, stage_id: form.stage_id || undefined, client_id: form.client_id || undefined, budget: form.budget || undefined }),
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ["projects"] }); onClose(); router.push(`/projects/${data.id}`); },
  });

  const filtered = projects.filter((p: { name: string }) => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
    <Topbar title="Projects" />
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-default-500 text-sm mt-1">{projects.length} project{projects.length !== 1 ? "s" : ""} total</p>
        </div>
        <Button color="primary" startContent={<Plus size={16} />} onPress={onOpen}>New Project</Button>
      </div>

      <div className="flex gap-3 mb-6">
        <Input
          placeholder="Search projects..."
          value={search}
          onValueChange={setSearch}
          startContent={<Search size={16} className="text-default-400" />}
          className="max-w-xs"
        />
        <Select placeholder="All Stages" className="max-w-48" selectedKeys={filterStage ? [filterStage] : []} onSelectionChange={(k) => setFilterStage(Array.from(k)[0] as string ?? "")}>
          {[{ id: "", name: "All Stages", color: "#888" }, ...stages].map((s: { id: string | number; name: string; color: string }) => (
            <SelectItem key={String(s.id)}>{s.name}</SelectItem>
          ))}
        </Select>
      </div>

      {isLoading ? (
        <CardGridSkeleton cards={6} />
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <FolderOpen size={48} className="mx-auto text-default-300 mb-4" />
          <p className="text-default-500">No projects found</p>
          <Button color="primary" className="mt-4" onPress={onOpen}>Create your first project</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p: {
            id: number; name: string; description?: string; priority: string;
            stage_name?: string; stage_color?: string; start_date?: string; end_date?: string;
            member_count: number; task_count: number; done_count: number;
            client_id?: number; client_name?: string;
          }) => (
            <div
              key={p.id}
              className="bg-content1 border border-divider rounded-xl p-5 cursor-pointer hover:border-primary transition-colors"
              onClick={() => router.push(`/projects/${p.id}`)}
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-base line-clamp-1">{p.name}</h3>
                <Chip size="sm" color={PRIORITY_COLORS[p.priority] ?? "default"} variant="flat">{p.priority}</Chip>
              </div>
              {p.description && <p className="text-sm text-default-500 line-clamp-2 mb-3">{p.description}</p>}
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                {p.stage_name && (
                  <span className="text-xs px-2 py-0.5 rounded-full text-white font-medium" style={{ background: p.stage_color ?? "#888" }}>{p.stage_name}</span>
                )}
                {p.client_name && (
                  <span className="flex items-center gap-1 text-xs text-default-500">
                    <Building2 size={11} />{p.client_name}
                  </span>
                )}
              </div>
              <div className="flex justify-between text-xs text-default-400">
                <span>{p.member_count} member{p.member_count !== 1 ? "s" : ""}</span>
                <span>{p.done_count}/{p.task_count} tasks done</span>
              </div>
              {p.task_count > 0 && (
                <div className="mt-2 h-1.5 bg-default-100 rounded-full overflow-hidden">
                  <div className="h-full bg-success rounded-full" style={{ width: `${Math.round((p.done_count / p.task_count) * 100)}%` }} />
                </div>
              )}
              {(p.start_date || p.end_date) && (
                <p className="text-xs text-default-400 mt-2">{p.start_date ?? "—"} → {p.end_date ?? "—"}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="lg">
        <ModalContent>
          <ModalHeader>New Project</ModalHeader>
          <ModalBody className="gap-4">
            <Input label="Project Name" isRequired value={form.name} onValueChange={(v) => setForm({ ...form, name: v })} />
            <Input label="Description" value={form.description} onValueChange={(v) => setForm({ ...form, description: v })} />
            <div className="grid grid-cols-2 gap-3">
              <Select label="Stage" selectedKeys={form.stage_id ? [form.stage_id] : []} onSelectionChange={(k) => setForm({ ...form, stage_id: Array.from(k)[0] as string ?? "" })}>
                {stages.map((s: { id: number; name: string }) => <SelectItem key={String(s.id)}>{s.name}</SelectItem>)}
              </Select>
              <Select label="Priority" selectedKeys={[form.priority]} onSelectionChange={(k) => setForm({ ...form, priority: Array.from(k)[0] as string ?? "medium" })}>
                {["low", "medium", "high", "critical"].map((p) => <SelectItem key={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>)}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm text-default-500 px-1">Client (optional)</label>
              <select
                value={form.client_id}
                onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-default-200 rounded-xl bg-default-100 focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">— None —</option>
                {clients.map((c) => (
                  <option key={c.id} value={String(c.id)}>{c.company_name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Start Date" type="date" value={form.start_date} onValueChange={(v) => setForm({ ...form, start_date: v })} />
              <Input label="End Date" type="date" value={form.end_date} onValueChange={(v) => setForm({ ...form, end_date: v })} />
            </div>
            <Input label="Budget (MYR)" type="number" value={form.budget} onValueChange={(v) => setForm({ ...form, budget: v })} />
            <Select
              label="Add Members"
              selectionMode="multiple"
              selectedKeys={form.member_ids ? form.member_ids.split(",").map((s) => s.trim()).filter(Boolean) : []}
              onSelectionChange={(k) => setForm({ ...form, member_ids: Array.from(k).join(",") })}
            >
              {users.map((u: { id: number; name: string; email: string }) => (
                <SelectItem key={String(u.id)}>{u.name} ({u.email})</SelectItem>
              ))}
            </Select>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onClose}>Cancel</Button>
            <Button color="primary" isLoading={createMutation.isPending} onPress={() => createMutation.mutate()} isDisabled={!form.name}>Create Project</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
    </div>
  );
}
