"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Topbar } from "@/components/ui/Topbar";
import { bugReportsApi } from "@/lib/api";
import { Bug, Trash2, ChevronDown } from "lucide-react";

const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-600",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  in_progress: "bg-purple-100 text-purple-700",
  fixed: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-500",
};

const STATUSES = ["open", "in_progress", "fixed", "closed"];
const SEVERITIES = ["low", "medium", "high", "critical"];

export default function BugsPage() {
  const qc = useQueryClient();
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});

  const { data: bugs = [], isLoading } = useQuery({
    queryKey: ["bug-reports", filterStatus, filterSeverity],
    queryFn: () => bugReportsApi.list({
      ...(filterStatus ? { status: filterStatus } : {}),
      ...(filterSeverity ? { severity: filterSeverity } : {}),
    }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => bugReportsApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bug-reports"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => bugReportsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bug-reports"] }),
  });

  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const open = (bugs as any[]).filter((b) => b.status === "open").length;
  const inProgress = (bugs as any[]).filter((b) => b.status === "in_progress").length;

  return (
    <div>
      <Topbar title="Bug Reports" />
      <div className="p-6 max-w-4xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Bug size={24} className="text-red-500" /> Bug Reports
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {open} open · {inProgress} in progress · {(bugs as any[]).length} total
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none bg-white"
          >
            <option value="">All Status</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </select>
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none bg-white"
          >
            <option value="">All Severity</option>
            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Bug list */}
        {isLoading ? (
          <p className="text-sm text-gray-400 text-center py-8">Loading...</p>
        ) : (bugs as any[]).length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Bug size={40} className="mx-auto mb-3 opacity-30" />
            <p>No bug reports found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {(bugs as any[]).map((bug) => (
              <div key={bug.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                {/* Row */}
                <div
                  className="flex items-start gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpanded(expanded === bug.id ? null : bug.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${SEVERITY_COLORS[bug.severity] ?? ""}`}>
                        {bug.severity}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[bug.status] ?? ""}`}>
                        {bug.status.replace("_", " ")}
                      </span>
                    </div>
                    <p className="font-medium text-gray-900 mt-1 truncate">{bug.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {bug.reported_by_name} · {bug.page_url} · {new Date(bug.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <ChevronDown
                    size={16}
                    className={`text-gray-400 mt-1 shrink-0 transition-transform ${expanded === bug.id ? "rotate-180" : ""}`}
                  />
                </div>

                {/* Expanded detail */}
                {expanded === bug.id && (
                  <div className="border-t border-gray-50 px-5 py-4 space-y-4 bg-gray-50/50">
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Description</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{bug.description}</p>
                    </div>
                    {bug.steps && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Steps to Reproduce</p>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{bug.steps}</p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      {/* Status */}
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Status</p>
                        <select
                          value={bug.status}
                          onChange={(e) => updateMutation.mutate({ id: bug.id, data: { status: e.target.value } })}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none"
                        >
                          {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                        </select>
                      </div>
                      {/* Severity */}
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Severity</p>
                        <select
                          value={bug.severity}
                          onChange={(e) => updateMutation.mutate({ id: bug.id, data: { severity: e.target.value } })}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none"
                        >
                          {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                    {/* Admin notes */}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Admin Notes (fix notes)</p>
                      <textarea
                        rows={2}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none resize-none"
                        placeholder="Document what caused this bug and how it was fixed..."
                        value={notes[bug.id] ?? bug.admin_notes ?? ""}
                        onChange={(e) => setNotes((n) => ({ ...n, [bug.id]: e.target.value }))}
                      />
                      <button
                        onClick={() => updateMutation.mutate({ id: bug.id, data: { admin_notes: notes[bug.id] ?? bug.admin_notes ?? "" } })}
                        className="mt-1 text-xs text-blue-600 hover:underline"
                      >Save notes</button>
                    </div>
                    {/* Actions */}
                    <div className="flex justify-end gap-2">
                      {confirmDelete === bug.id ? (
                        <>
                          <button onClick={() => setConfirmDelete(null)} className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg">Cancel</button>
                          <button
                            onClick={() => { deleteMutation.mutate(bug.id); setConfirmDelete(null); }}
                            className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700"
                          >Confirm Delete</button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(bug.id)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                        >
                          <Trash2 size={13} /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
