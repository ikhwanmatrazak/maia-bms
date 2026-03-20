"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hrApi } from "@/lib/api";
import { Plus, Check, X } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  paid: "bg-blue-100 text-blue-700",
};

const CLAIM_TYPES = ["Travel", "Medical", "Meal", "Accommodation", "Equipment", "Training", "Other"];

export default function ClaimsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const [form, setForm] = useState({ employee_id: "", claim_type: "Travel", description: "", amount: "", claim_date: new Date().toISOString().split("T")[0] });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const set = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  const { data: claims = [], isLoading } = useQuery({
    queryKey: ["hr-claims", statusFilter],
    queryFn: () => hrApi.listClaims({ status: statusFilter || undefined }),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["hr-employees"],
    queryFn: () => hrApi.listEmployees(),
  });

  const createMutation = useMutation({
    mutationFn: (data: FormData) => hrApi.createClaim(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr-claims"] }); setShowModal(false); setForm({ employee_id: "", claim_type: "Travel", description: "", amount: "", claim_date: new Date().toISOString().split("T")[0] }); setReceiptFile(null); },
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => hrApi.approveClaim(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr-claims"] }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => hrApi.rejectClaim(id, reason),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr-claims"] }); setRejectId(null); setRejectReason(""); },
  });

  const handleSubmit = () => {
    const fd = new FormData();
    fd.append("employee_id", form.employee_id);
    fd.append("claim_type", form.claim_type);
    fd.append("description", form.description);
    fd.append("amount", form.amount);
    fd.append("claim_date", form.claim_date);
    if (receiptFile) fd.append("receipt", receiptFile);
    createMutation.mutate(fd);
  };

  const fmt = (v: number) => `MYR ${v.toLocaleString("en-MY", { minimumFractionDigits: 2 })}`;
  const totalApproved = claims.filter((c: any) => c.status === "approved").reduce((s: number, c: any) => s + c.amount, 0);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Claims</h1>
          <p className="text-sm text-gray-500">{claims.filter((c: any) => c.status === "pending").length} pending · {fmt(totalApproved)} approved</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-[#1a1a2e] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#2a2a3e]">
          <Plus size={16} /> Submit Claim
        </button>
      </div>

      <div className="flex gap-3">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none bg-white">
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="paid">Paid</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="py-10 text-center text-sm text-gray-400">Loading...</div>
        ) : claims.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">No claims found</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Employee</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 hidden md:table-cell">Description</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Amount</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 hidden md:table-cell">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {claims.map((c: any) => (
                <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{c.employee_name || "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{c.claim_type}</td>
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell text-xs max-w-xs truncate">{c.description}</td>
                  <td className="px-4 py-3 text-right font-semibold">{fmt(c.amount)}</td>
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell text-xs">{c.claim_date}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[c.status] || "bg-gray-100 text-gray-600"}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {c.status === "pending" && (
                      <div className="flex justify-end gap-2">
                        <button onClick={() => approveMutation.mutate(c.id)} className="text-green-600 hover:text-green-800 p-1 rounded hover:bg-green-50" title="Approve">
                          <Check size={14} />
                        </button>
                        <button onClick={() => setRejectId(c.id)} className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50" title="Reject">
                          <X size={14} />
                        </button>
                      </div>
                    )}
                    {c.receipt_url && (
                      <a href={c.receipt_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline ml-2">Receipt</a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Submit Claim Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold">Submit Claim</h2>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Employee</label>
              <select className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={form.employee_id} onChange={e => set("employee_id", e.target.value)}>
                <option value="">Select employee</option>
                {employees.map((e: any) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Claim Type</label>
                <select className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={form.claim_type} onChange={e => set("claim_type", e.target.value)}>
                  {CLAIM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Date</label>
                <input type="date" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={form.claim_date} onChange={e => set("claim_date", e.target.value)} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Description</label>
              <textarea rows={2} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={form.description} onChange={e => set("description", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Amount (MYR)</label>
              <input type="number" step="0.01" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={form.amount} onChange={e => set("amount", e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Receipt (optional)</label>
              <label className="flex items-center gap-2 px-4 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 cursor-pointer hover:bg-gray-50">
                {receiptFile ? receiptFile.name : "Choose file"}
                <input type="file" className="hidden" onChange={e => setReceiptFile(e.target.files?.[0] || null)} />
              </label>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg">Cancel</button>
              <button disabled={!form.employee_id || !form.description || !form.amount || createMutation.isPending} onClick={handleSubmit} className="px-4 py-2 text-sm font-medium bg-[#1a1a2e] text-white rounded-lg disabled:opacity-40">
                {createMutation.isPending ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-bold">Reject Claim</h2>
            <div><label className="block text-xs font-semibold text-gray-500 mb-1">Reason</label><textarea rows={3} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={rejectReason} onChange={e => setRejectReason(e.target.value)} /></div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setRejectId(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg">Cancel</button>
              <button onClick={() => rejectMutation.mutate({ id: rejectId, reason: rejectReason })} className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg">Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
