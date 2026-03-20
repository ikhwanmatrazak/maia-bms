"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hrApi } from "@/lib/api";
import { Plus, Edit2 } from "lucide-react";

const RATING_COLORS: Record<string, string> = {
  excellent: "bg-emerald-100 text-emerald-700",
  good: "bg-green-100 text-green-700",
  satisfactory: "bg-blue-100 text-blue-700",
  needs_improvement: "bg-yellow-100 text-yellow-700",
  poor: "bg-red-100 text-red-700",
};

const RATING_LABELS: Record<string, string> = {
  excellent: "Excellent",
  good: "Good",
  satisfactory: "Satisfactory",
  needs_improvement: "Needs Improvement",
  poor: "Poor",
};

const PERIODS = ["2026-Q1","2026-H1","2026","2025-Q4","2025-Q3","2025-H2","2025-H1","2025","2024"];

const emptyForm = {
  employee_id: "", review_period: PERIODS[0], review_date: new Date().toISOString().split("T")[0],
  rating: "", kpi_score: "", self_review: "", manager_review: "", goals_next_period: "",
};

export default function PerformancePage() {
  const qc = useQueryClient();
  const [empFilter, setEmpFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const set = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ["hr-performance", empFilter],
    queryFn: () => hrApi.listPerformance({ employee_id: empFilter || undefined }),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["hr-employees"],
    queryFn: () => hrApi.listEmployees(),
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => hrApi.createPerformance(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr-performance"] }); closeModal(); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => hrApi.updatePerformance(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr-performance"] }); closeModal(); },
  });

  const openCreate = () => { setEditId(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (r: any) => {
    setEditId(r.id);
    setForm({
      employee_id: String(r.employee_id),
      review_period: r.review_period,
      review_date: r.review_date,
      rating: r.rating || "",
      kpi_score: r.kpi_score != null ? String(r.kpi_score) : "",
      self_review: r.self_review || "",
      manager_review: r.manager_review || "",
      goals_next_period: r.goals_next_period || "",
    });
    setShowModal(true);
  };
  const closeModal = () => { setShowModal(false); setEditId(null); };

  const handleSubmit = () => {
    const data: any = {
      employee_id: Number(form.employee_id),
      review_period: form.review_period,
      review_date: form.review_date,
      rating: form.rating || null,
      kpi_score: form.kpi_score ? Number(form.kpi_score) : null,
      self_review: form.self_review || null,
      manager_review: form.manager_review || null,
      goals_next_period: form.goals_next_period || null,
    };
    if (editId) updateMutation.mutate({ id: editId, data });
    else createMutation.mutate(data);
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Performance Reviews</h1>
          <p className="text-sm text-gray-500">{reviews.length} reviews</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-[#1a1a2e] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#2a2a3e]">
          <Plus size={16} /> Add Review
        </button>
      </div>

      <div className="flex gap-3">
        <select value={empFilter} onChange={e => setEmpFilter(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none bg-white">
          <option value="">All Employees</option>
          {employees.map((e: any) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="py-10 text-center text-sm text-gray-400">Loading...</div>
        ) : reviews.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">No performance reviews yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Employee</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Period</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 hidden md:table-cell">KPI Score</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Rating</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 hidden lg:table-cell">Manager Review</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {reviews.map((r: any) => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{r.employee_name || "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{r.review_period}</td>
                  <td className="px-4 py-3 text-right hidden md:table-cell">
                    {r.kpi_score != null ? (
                      <span className={`font-bold ${r.kpi_score >= 80 ? "text-green-700" : r.kpi_score >= 60 ? "text-yellow-700" : "text-red-700"}`}>
                        {r.kpi_score}/100
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {r.rating ? (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${RATING_COLORS[r.rating] || "bg-gray-100 text-gray-600"}`}>
                        {RATING_LABELS[r.rating] || r.rating}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden lg:table-cell text-xs max-w-xs truncate">{r.manager_review || "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(r)} className="text-gray-400 hover:text-gray-600"><Edit2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-lg my-4 p-6 space-y-4">
            <h2 className="text-lg font-bold">{editId ? "Edit" : "Add"} Performance Review</h2>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Employee</label>
              <select className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={form.employee_id} onChange={e => set("employee_id", e.target.value)}>
                <option value="">Select employee</option>
                {employees.map((e: any) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Review Period</label>
                <select className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={form.review_period} onChange={e => set("review_period", e.target.value)}>
                  {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Review Date</label>
                <input type="date" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={form.review_date} onChange={e => set("review_date", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Rating</label>
                <select className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={form.rating} onChange={e => set("rating", e.target.value)}>
                  <option value="">— Select —</option>
                  {Object.entries(RATING_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">KPI Score (out of 100)</label>
                <input type="number" min="0" max="100" step="0.1" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={form.kpi_score} onChange={e => set("kpi_score", e.target.value)} placeholder="e.g. 85" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Manager Review</label>
              <textarea rows={3} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={form.manager_review} onChange={e => set("manager_review", e.target.value)} placeholder="Performance summary and observations..." />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Employee Self-Review</label>
              <textarea rows={2} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={form.self_review} onChange={e => set("self_review", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Goals for Next Period</label>
              <textarea rows={2} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={form.goals_next_period} onChange={e => set("goals_next_period", e.target.value)} />
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={closeModal} className="px-4 py-2 text-sm border border-gray-200 rounded-lg">Cancel</button>
              <button
                disabled={!form.employee_id || createMutation.isPending || updateMutation.isPending}
                onClick={handleSubmit}
                className="px-4 py-2 text-sm font-medium bg-[#1a1a2e] text-white rounded-lg disabled:opacity-40"
              >
                {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
