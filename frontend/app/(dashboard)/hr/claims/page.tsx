"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { userClaimsApi, usersApi, MonthlyClaim, downloadPdf } from "@/lib/api";
import { Check, X, Download, Plus } from "lucide-react";
import { Topbar } from "@/components/ui/Topbar";
import { TableSkeleton } from "@/components/ui/PageSkeleton";

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1").replace(/\/api\/v1\/?$/, "");

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  paid: "bg-blue-100 text-blue-700",
  draft: "bg-gray-100 text-gray-600",
  submitted: "bg-blue-100 text-blue-700",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const CLAIM_TYPES = ["Meals", "Petrol", "Travel", "Parking", "Accommodation", "Medical", "Office Supplies", "Other"];

const fmt = (v: number) => `RM ${Number(v).toLocaleString("en-MY", { minimumFractionDigits: 2 })}`;

const emptyClaimForm = {
  on_behalf_of_user_id: "",
  title: "",
  claim_type: "Other",
  description: "",
  amount: "",
  claim_date: new Date().toISOString().slice(0, 10),
};

export default function HRClaimsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"all" | "monthly">("all");

  // All Claims state
  const [statusFilter, setStatusFilter] = useState("");
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // Monthly Claims state
  const [rejectMonthlyId, setRejectMonthlyId] = useState<number | null>(null);
  const [rejectMonthlyReason, setRejectMonthlyReason] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Create claim on behalf state
  const [createModal, setCreateModal] = useState(false);
  const [claimForm, setClaimForm] = useState({ ...emptyClaimForm });
  const [claimReceipt, setClaimReceipt] = useState<File | null>(null);

  // Queries
  const { data: staffList = [] } = useQuery<any[]>({
    queryKey: ["users-list"],
    queryFn: () => usersApi.list(),
  });

  const { data: claims = [], isLoading: loadingClaims } = useQuery({
    queryKey: ["hr-claims-all", statusFilter],
    queryFn: () => userClaimsApi.listAll(statusFilter || undefined),
    enabled: tab === "all",
  });

  const { data: monthlyClaims = [], isLoading: loadingMonthly } = useQuery<MonthlyClaim[]>({
    queryKey: ["hr-monthly-claims-all"],
    queryFn: () => userClaimsApi.listAllMonthly(),
    enabled: tab === "monthly",
  });

  // Mutations — All Claims
  const approveMutation = useMutation({
    mutationFn: (id: number) => userClaimsApi.approve(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr-claims-all"] }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => userClaimsApi.reject(id, reason),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr-claims-all"] }); setRejectId(null); setRejectReason(""); },
  });

  const submitOnBehalfMutation = useMutation({
    mutationFn: (form: FormData) => userClaimsApi.submitOnBehalf(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-claims-all"] });
      setCreateModal(false);
      setClaimForm({ ...emptyClaimForm });
      setClaimReceipt(null);
    },
  });

  const handleSubmitOnBehalf = () => {
    if (!claimForm.on_behalf_of_user_id || !claimForm.title || !claimForm.amount || !claimForm.claim_date) return;
    const fd = new FormData();
    fd.append("on_behalf_of_user_id", claimForm.on_behalf_of_user_id);
    fd.append("title", claimForm.title);
    fd.append("claim_type", claimForm.claim_type);
    fd.append("description", claimForm.description);
    fd.append("amount", claimForm.amount);
    fd.append("claim_date", claimForm.claim_date);
    if (claimReceipt) fd.append("receipt", claimReceipt);
    submitOnBehalfMutation.mutate(fd);
  };

  // Mutations — Monthly Claims
  const approveMonthlyMutation = useMutation({
    mutationFn: (id: number) => userClaimsApi.approveMonthly(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr-monthly-claims-all"] }),
  });

  const rejectMonthlyMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => userClaimsApi.rejectMonthly(id, reason),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr-monthly-claims-all"] }); setRejectMonthlyId(null); setRejectMonthlyReason(""); },
  });

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === monthlyClaims.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(monthlyClaims.map(m => m.id)));
    }
  };

  const handleDownloadPaymentSummary = async () => {
    if (selectedIds.size === 0) return;
    setDownloadingPdf(true);
    try {
      const blob = await userClaimsApi.paymentSummaryPdf(Array.from(selectedIds));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Payment_Summary_${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    } finally {
      setDownloadingPdf(false);
    }
  };

  const pendingCount = claims.filter((c: any) => c.status === "pending").length;
  const totalApproved = claims.filter((c: any) => c.status === "approved").reduce((s: number, c: any) => s + Number(c.amount), 0);
  const pendingMonthly = monthlyClaims.filter(m => m.status === "submitted").length;

  const isLoading = tab === "all" ? loadingClaims : loadingMonthly;

  return (
    <div>
      <Topbar title="HR Claims" />
      <div className="p-6 space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Claims Management</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {tab === "all"
                ? `${pendingCount} pending · ${fmt(totalApproved)} approved`
                : `${pendingMonthly} awaiting approval`}
            </p>
          </div>
          <button
            onClick={() => { setClaimForm({ ...emptyClaimForm }); setClaimReceipt(null); setCreateModal(true); }}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 whitespace-nowrap"
          >
            <Plus size={15} /> Create Claim
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          {(["all", "monthly"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                tab === t ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t === "all" ? "All Claims" : "Monthly Claims"}
            </button>
          ))}
        </div>

        {isLoading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : tab === "all" ? (
          <>
            {/* Status filter */}
            <div className="flex gap-3">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none"
              >
                <option value="">All Status</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="paid">Paid</option>
              </select>
            </div>

            {/* All Claims Table */}
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              {claims.length === 0 ? (
                <div className="py-12 text-center text-sm text-gray-400">No claims found</div>
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
                        <td className="px-4 py-3 font-medium">{c.submitted_by_name || "—"}</td>
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
                          <div className="flex items-center justify-end gap-2">
                            {c.status === "pending" && (
                              <>
                                <button onClick={() => approveMutation.mutate(c.id)} className="text-green-600 hover:text-green-800 p-1 rounded hover:bg-green-50" title="Approve">
                                  <Check size={14} />
                                </button>
                                <button onClick={() => setRejectId(c.id)} className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50" title="Reject">
                                  <X size={14} />
                                </button>
                              </>
                            )}
                            {c.receipt_url && (
                              <a href={`${API_ORIGIN}/uploads/${c.receipt_url}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">
                                Receipt
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        ) : (
          /* Monthly Claims Table */
          <>
            {selectedIds.size > 0 && (
              <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5">
                <span className="text-sm text-blue-700 font-medium">{selectedIds.size} selected</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setSelectedIds(new Set())} className="text-xs text-blue-500 hover:text-blue-700">Clear</button>
                  <button
                    onClick={handleDownloadPaymentSummary}
                    disabled={downloadingPdf}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
                  >
                    <Download size={14} />
                    {downloadingPdf ? "Generating..." : "Download Payment Summary"}
                  </button>
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              {monthlyClaims.length === 0 ? (
                <div className="py-12 text-center text-sm text-gray-400">No monthly claims found</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="px-4 py-3 w-10">
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={selectedIds.size === monthlyClaims.length && monthlyClaims.length > 0}
                          onChange={toggleSelectAll}
                        />
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Employee</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Period</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Claims</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Total (RM)</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Status</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyClaims.map((m) => (
                      <tr key={m.id} className={`border-b border-gray-50 hover:bg-gray-50 ${selectedIds.has(m.id) ? "bg-blue-50/40" : ""}`}>
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            className="rounded"
                            checked={selectedIds.has(m.id)}
                            onChange={() => toggleSelect(m.id)}
                          />
                        </td>
                        <td className="px-4 py-3 font-medium">{m.submitted_by_name || "—"}</td>
                        <td className="px-4 py-3 font-semibold">{MONTHS[(m.month ?? 1) - 1]} {m.year}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{m.claim_count}</td>
                        <td className="px-4 py-3 text-right font-semibold">{fmt(m.total_amount)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[m.status] || "bg-gray-100 text-gray-600"}`}>
                            {m.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {m.status === "submitted" && (
                              <>
                                <button
                                  onClick={() => approveMonthlyMutation.mutate(m.id)}
                                  className="text-green-600 hover:text-green-800 p-1 rounded hover:bg-green-50"
                                  title="Approve"
                                >
                                  <Check size={14} />
                                </button>
                                <button
                                  onClick={() => setRejectMonthlyId(m.id)}
                                  className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50"
                                  title="Reject"
                                >
                                  <X size={14} />
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => downloadPdf(userClaimsApi.monthlyPdfUrl(m.id), `claims-${m.year}-${String(m.month).padStart(2, "0")}.pdf`)}
                              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded border border-gray-200 hover:bg-gray-50"
                              title="Download detailed PDF"
                            >
                              <Download size={12} /> PDF
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* Reject Claim Modal */}
        {rejectId && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
              <h2 className="text-lg font-bold">Reject Claim</h2>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Reason</label>
                <textarea rows={3} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
              </div>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setRejectId(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg">Cancel</button>
                <button onClick={() => rejectMutation.mutate({ id: rejectId, reason: rejectReason })} className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg">Reject</button>
              </div>
            </div>
          </div>
        )}

        {/* Create Claim on Behalf Modal */}
        {createModal && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
              <h2 className="text-lg font-bold">Create Claim on Behalf of Staff</h2>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Employee *</label>
                <select
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none"
                  value={claimForm.on_behalf_of_user_id}
                  onChange={e => setClaimForm({ ...claimForm, on_behalf_of_user_id: e.target.value })}
                >
                  <option value="">Select employee...</option>
                  {staffList.map((u: any) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Claim Type *</label>
                  <select
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none"
                    value={claimForm.claim_type}
                    onChange={e => setClaimForm({ ...claimForm, claim_type: e.target.value })}
                  >
                    {CLAIM_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Date *</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none"
                    value={claimForm.claim_date}
                    onChange={e => setClaimForm({ ...claimForm, claim_date: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Title *</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none"
                  placeholder="e.g. Petrol — site visit"
                  value={claimForm.title}
                  onChange={e => setClaimForm({ ...claimForm, title: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Description</label>
                <textarea
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none"
                  value={claimForm.description}
                  onChange={e => setClaimForm({ ...claimForm, description: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Amount (RM) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none"
                  placeholder="0.00"
                  value={claimForm.amount}
                  onChange={e => setClaimForm({ ...claimForm, amount: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Receipt (optional)</label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-600 hover:file:bg-blue-100"
                  onChange={e => setClaimReceipt(e.target.files?.[0] ?? null)}
                />
              </div>

              <div className="flex gap-3 justify-end pt-1">
                <button onClick={() => setCreateModal(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg">Cancel</button>
                <button
                  onClick={handleSubmitOnBehalf}
                  disabled={submitOnBehalfMutation.isPending || !claimForm.on_behalf_of_user_id || !claimForm.title || !claimForm.amount}
                  className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg disabled:opacity-50"
                >
                  {submitOnBehalfMutation.isPending ? "Submitting..." : "Submit Claim"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reject Monthly Claim Modal */}
        {rejectMonthlyId && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
              <h2 className="text-lg font-bold">Reject Monthly Claim</h2>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Reason</label>
                <textarea rows={3} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={rejectMonthlyReason} onChange={e => setRejectMonthlyReason(e.target.value)} />
              </div>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setRejectMonthlyId(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg">Cancel</button>
                <button onClick={() => rejectMonthlyMutation.mutate({ id: rejectMonthlyId, reason: rejectMonthlyReason })} className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg">Reject</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
