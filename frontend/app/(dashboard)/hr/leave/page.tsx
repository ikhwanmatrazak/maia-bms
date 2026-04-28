"use client";
import { Topbar } from "@/components/ui/Topbar";
import { TableSkeleton } from "@/components/ui/PageSkeleton";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hrApi } from "@/lib/api";
import { Plus, Check, X, Upload } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-600",
};

export default function LeavePage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"applications" | "types" | "balances">("applications");
  const [showApply, setShowApply] = useState(false);
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [assignLeaveType, setAssignLeaveType] = useState<any>(null);
  const [assignSelected, setAssignSelected] = useState<number[]>([]);
  const [assignSearch, setAssignSearch] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignResult, setAssignResult] = useState<any>(null);

  // Apply leave form
  const [applyForm, setApplyForm] = useState({
    employee_id: "", leave_type_id: "", start_date: "", end_date: "", days: "", reason: "",
  });
  const setA = (k: string, v: any) => setApplyForm(prev => ({ ...prev, [k]: v }));

  // Leave type form
  const [typeForm, setTypeForm] = useState({ name: "", days_per_year: 14, is_paid: true, requires_document: false, is_pro_rated: false });
  const setT = (k: string, v: any) => setTypeForm(prev => ({ ...prev, [k]: v }));

  const { data: applications = [], isLoading } = useQuery({
    queryKey: ["hr-leave", statusFilter],
    queryFn: () => hrApi.listLeave({ status: statusFilter || undefined }),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["hr-employees"],
    queryFn: () => hrApi.listEmployees(),
  });

  const { data: leaveTypes = [] } = useQuery({
    queryKey: ["hr-leave-types"],
    queryFn: hrApi.listLeaveTypes,
  });

  const applyMutation = useMutation({
    mutationFn: (data: object) => hrApi.applyLeave(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr-leave"] }); setShowApply(false); setApplyForm({ employee_id: "", leave_type_id: "", start_date: "", end_date: "", days: "", reason: "" }); },
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => hrApi.approveLeave(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr-leave"] }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => hrApi.rejectLeave(id, reason),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr-leave"] }); setRejectId(null); setRejectReason(""); },
  });

  const createTypeMutation = useMutation({
    mutationFn: (data: object) => hrApi.createLeaveType(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr-leave-types"] }); setShowTypeModal(false); },
  });

  const TABS = [
    { key: "applications", label: "Applications" },
    { key: "types", label: "Leave Types" },
  ] as const;

  if (isLoading) return (
    <div>
      <Topbar title="Leave Management" />
      <div className="p-6"><TableSkeleton rows={6} cols={5} /></div>
    </div>
  );

  return (
    <div><Topbar title="Leave Management" /><div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Management</h1>
          <p className="text-sm text-gray-500">{applications.filter((a: any) => a.status === "pending").length} pending approvals</p>
        </div>
        <div className="flex gap-2">
          {tab === "types" && (
            <button onClick={() => setShowTypeModal(true)} className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200">
              <Plus size={16} /> Add Type
            </button>
          )}
          <button onClick={() => setShowApply(true)} className="flex items-center gap-2 bg-[#1a1a2e] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#2a2a3e]">
            <Plus size={16} /> Apply Leave
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "applications" && (
        <>
          <div className="flex gap-3">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none bg-white">
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {applications.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">No leave applications found</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Employee</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Type</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Period</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Days</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((a: any) => (
                    <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{a.employee_name || "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{a.leave_type_name || "—"}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{a.start_date} → {a.end_date}</td>
                      <td className="px-4 py-3 text-right font-semibold">{a.days}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[a.status] || "bg-gray-100 text-gray-600"}`}>
                          {a.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {a.status === "pending" && (
                          <div className="flex justify-end gap-2">
                            <button onClick={() => approveMutation.mutate(a.id)} className="text-green-600 hover:text-green-800 p-1 rounded hover:bg-green-50" title="Approve">
                              <Check size={14} />
                            </button>
                            <button onClick={() => setRejectId(a.id)} className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50" title="Reject">
                              <X size={14} />
                            </button>
                          </div>
                        )}
                        {a.rejection_reason && <p className="text-xs text-red-500 text-right">{a.rejection_reason}</p>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === "types" && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Leave Type</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Days/Year</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500">Paid</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500">Requires Doc</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {leaveTypes.length === 0 ? (
                <tr><td colSpan={5} className="py-10 text-center text-gray-400 text-sm">No leave types. Add one above.</td></tr>
              ) : leaveTypes.map((t: any) => (
                <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">
                    {t.name}
                    {t.is_pro_rated && <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">Pro-rated</span>}
                  </td>
                  <td className="px-4 py-3 text-right">{t.days_per_year}</td>
                  <td className="px-4 py-3 text-center">{t.is_paid ? "✓" : "—"}</td>
                  <td className="px-4 py-3 text-center">{t.requires_document ? "✓" : "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => { setAssignLeaveType(t); setAssignSelected([]); setAssignSearch(""); setAssignResult(null); }}
                      className="px-3 py-1.5 text-xs font-medium text-green-700 border border-green-200 rounded-lg hover:bg-green-50"
                    >
                      Assign to Staff
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Apply Leave Modal */}
      {showApply && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold">Apply Leave</h2>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Employee</label>
              <select className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={applyForm.employee_id} onChange={e => setA("employee_id", e.target.value)}>
                <option value="">Select employee</option>
                {employees.map((e: any) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Leave Type</label>
              <select className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={applyForm.leave_type_id} onChange={e => setA("leave_type_id", e.target.value)}>
                <option value="">Select type</option>
                {leaveTypes.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">Start Date</label><input type="date" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={applyForm.start_date} onChange={e => setA("start_date", e.target.value)} /></div>
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">End Date</label><input type="date" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={applyForm.end_date} onChange={e => setA("end_date", e.target.value)} /></div>
            </div>
            <div><label className="block text-xs font-semibold text-gray-500 mb-1">No. of Days</label><input type="number" step="0.5" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={applyForm.days} onChange={e => setA("days", e.target.value)} /></div>
            <div><label className="block text-xs font-semibold text-gray-500 mb-1">Reason (optional)</label><textarea rows={2} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={applyForm.reason} onChange={e => setA("reason", e.target.value)} /></div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowApply(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg">Cancel</button>
              <button
                disabled={!applyForm.employee_id || !applyForm.leave_type_id || !applyForm.start_date || !applyForm.days || applyMutation.isPending}
                onClick={() => applyMutation.mutate({ ...applyForm, employee_id: Number(applyForm.employee_id), leave_type_id: Number(applyForm.leave_type_id), days: Number(applyForm.days) })}
                className="px-4 py-2 text-sm font-medium bg-[#1a1a2e] text-white rounded-lg disabled:opacity-40"
              >
                {applyMutation.isPending ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-bold">Reject Leave</h2>
            <div><label className="block text-xs font-semibold text-gray-500 mb-1">Reason</label><textarea rows={3} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={rejectReason} onChange={e => setRejectReason(e.target.value)} /></div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setRejectId(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg">Cancel</button>
              <button onClick={() => rejectMutation.mutate({ id: rejectId, reason: rejectReason })} className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg">Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Leave Type Modal */}
      {showTypeModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-bold">Add Leave Type</h2>
            <div><label className="block text-xs font-semibold text-gray-500 mb-1">Name</label><input className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={typeForm.name} onChange={e => setT("name", e.target.value)} placeholder="e.g. Annual Leave" /></div>
            <div><label className="block text-xs font-semibold text-gray-500 mb-1">Days per Year</label><input type="number" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={typeForm.days_per_year} onChange={e => setT("days_per_year", Number(e.target.value))} /></div>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={typeForm.is_paid} onChange={e => setT("is_paid", e.target.checked)} /> Paid leave</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={typeForm.requires_document} onChange={e => setT("requires_document", e.target.checked)} /> Requires document</label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={typeForm.is_pro_rated} onChange={e => setT("is_pro_rated", e.target.checked)} />
                Pro-rated by join date
                <span className="text-xs text-gray-400">(entitlement = days/12 × months worked)</span>
              </label>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowTypeModal(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg">Cancel</button>
              <button disabled={!typeForm.name || createTypeMutation.isPending} onClick={() => createTypeMutation.mutate(typeForm)} className="px-4 py-2 text-sm font-medium bg-[#1a1a2e] text-white rounded-lg disabled:opacity-40">
                {createTypeMutation.isPending ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Assign Leave Type to Staff Modal */}
      {assignLeaveType && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between shrink-0">
              <div>
                <h2 className="text-base font-bold text-gray-900">Assign: {assignLeaveType.name}</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {assignLeaveType.days_per_year} days/year
                  {assignLeaveType.is_pro_rated && " · Pro-rated by join date"}
                </p>
              </div>
              <button onClick={() => setAssignLeaveType(null)} className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none mt-0.5">×</button>
            </div>

            {assignResult ? (
              <div className="px-6 py-6 space-y-4">
                <div className="bg-green-50 rounded-xl p-4 text-sm space-y-1">
                  <p className="font-semibold text-green-700">Assignment Complete ✓</p>
                  <p>✓ Created: <strong>{assignResult.created}</strong> new balances</p>
                  {assignResult.skipped > 0 && <p className="text-gray-500">— Skipped: <strong>{assignResult.skipped}</strong> (already had this leave type)</p>}
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={() => { setAssignLeaveType(null); setAssignResult(null); }} className="px-5 py-2 text-sm font-medium bg-[#1a1a2e] text-white rounded-lg">Done</button>
                </div>
              </div>
            ) : (
              <>
                {/* Search */}
                <div className="px-6 pt-4 shrink-0">
                  <input
                    type="text"
                    placeholder="Search employees..."
                    value={assignSearch}
                    onChange={e => setAssignSearch(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-gray-400">{assignSelected.length} selected</span>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setAssignSelected((employees as any[]).map((e: any) => e.id))}
                        className="text-xs text-blue-600 hover:underline"
                      >Select all</button>
                      <button onClick={() => setAssignSelected([])} className="text-xs text-gray-400 hover:underline">Clear</button>
                    </div>
                  </div>
                </div>

                {/* Employee list */}
                <div className="flex-1 overflow-y-auto px-6 py-2 space-y-1 min-h-0">
                  {(employees as any[])
                    .filter((e: any) =>
                      !assignSearch || e.full_name.toLowerCase().includes(assignSearch.toLowerCase()) ||
                      (e.employee_no || "").toLowerCase().includes(assignSearch.toLowerCase())
                    )
                    .map((e: any) => {
                      const checked = assignSelected.includes(e.id);
                      return (
                        <label key={e.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${checked ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded"
                            checked={checked}
                            onChange={ev => setAssignSelected(prev => ev.target.checked ? [...prev, e.id] : prev.filter(x => x !== e.id))}
                          />
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-semibold shrink-0">
                            {e.full_name.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{e.full_name}</p>
                            <p className="text-xs text-gray-400">{e.employee_no}{e.designation ? ` · ${e.designation}` : ""}</p>
                          </div>
                          {assignLeaveType.is_pro_rated && e.join_date && (() => {
                            const year = new Date().getFullYear();
                            const join = new Date(e.join_date);
                            const yearStart = new Date(year, 0, 1);
                            const from = join > yearStart ? join : yearStart;
                            const months = Math.min(12, (new Date(year, 11, 31).getFullYear() - from.getFullYear()) * 12 + (11 - from.getMonth()) + 1);
                            const days = Math.round((assignLeaveType.days_per_year / 12) * months * 100) / 100;
                            return <span className="text-xs text-blue-600 font-medium shrink-0">{days}d</span>;
                          })()}
                        </label>
                      );
                    })}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
                  <button onClick={() => setAssignLeaveType(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                  <button
                    disabled={assigning || assignSelected.length === 0}
                    onClick={async () => {
                      setAssigning(true);
                      const year = new Date().getFullYear();
                      let created = 0; let skipped = 0;
                      for (const empId of assignSelected) {
                        const emp = (employees as any[]).find((e: any) => e.id === empId);
                        let entitled = assignLeaveType.days_per_year;
                        if (assignLeaveType.is_pro_rated && emp?.join_date) {
                          const join = new Date(emp.join_date);
                          const yearStart = new Date(year, 0, 1);
                          const from = join > yearStart ? join : yearStart;
                          const months = Math.min(12, (new Date(year, 11, 31).getFullYear() - from.getFullYear()) * 12 + (11 - from.getMonth()) + 1);
                          entitled = Math.round((assignLeaveType.days_per_year / 12) * months * 100) / 100;
                        }
                        try {
                          await hrApi.setLeaveBalance({ employee_id: empId, leave_type_id: assignLeaveType.id, year, entitled });
                          created++;
                        } catch { skipped++; }
                      }
                      setAssigning(false);
                      setAssignResult({ created, skipped });
                    }}
                    className="px-5 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    {assigning ? "Assigning..." : `Assign to ${assignSelected.length} staff`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
