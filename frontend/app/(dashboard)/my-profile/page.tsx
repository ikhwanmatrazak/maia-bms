"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hrApi, userClaimsApi } from "@/lib/api";
import { Topbar } from "@/components/ui/Topbar";
import {
  User, Briefcase, Calendar, FileText, Plus, ChevronRight,
  Phone, Mail, MapPin, AlertCircle,
} from "lucide-react";
import Link from "next/link";

const FIELD = ({ label, value }: { label: string; value?: string | number | null }) =>
  value ? (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium text-gray-800 mt-0.5">{String(value)}</p>
    </div>
  ) : null;

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
};

export default function MyProfilePage() {
  const qc = useQueryClient();
  const [leaveModal, setLeaveModal] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    leave_type_id: "", start_date: "", end_date: "", reason: "",
  });

  const { data: emp, isLoading, error } = useQuery({
    queryKey: ["my-employee-profile"],
    queryFn: hrApi.getMyProfile,
    retry: false,
  });

  const { data: leaveTypes = [] } = useQuery({
    queryKey: ["leave-types"],
    queryFn: hrApi.listLeaveTypes,
    enabled: !!emp,
  });

  const { data: leaveBalances = [] } = useQuery({
    queryKey: ["my-leave-balances", emp?.id],
    queryFn: () => hrApi.listLeaveBalances({ employee_id: emp!.id }),
    enabled: !!emp,
  });

  const { data: myLeave = [] } = useQuery({
    queryKey: ["my-leave", emp?.id],
    queryFn: () => hrApi.listLeave({ employee_id: emp!.id }),
    enabled: !!emp,
  });

  const { data: myClaims = [] } = useQuery({
    queryKey: ["user-claims", "my"],
    queryFn: userClaimsApi.listMy,
  });

  const applyLeaveMutation = useMutation({
    mutationFn: (data: object) => hrApi.applyLeave(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-leave"] });
      qc.invalidateQueries({ queryKey: ["my-leave-balances"] });
      setLeaveModal(false);
      setLeaveForm({ leave_type_id: "", start_date: "", end_date: "", reason: "" });
    },
  });

  const handleApplyLeave = () => {
    if (!leaveForm.leave_type_id || !leaveForm.start_date || !leaveForm.end_date) {
      alert("Please fill in all required fields.");
      return;
    }
    const start = new Date(leaveForm.start_date);
    const end = new Date(leaveForm.end_date);
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
    applyLeaveMutation.mutate({
      employee_id: emp!.id,
      leave_type_id: Number(leaveForm.leave_type_id),
      start_date: leaveForm.start_date,
      end_date: leaveForm.end_date,
      days,
      reason: leaveForm.reason,
    });
  };

  if (isLoading) {
    return (
      <div>
        <Topbar title="My Profile" />
        <div className="flex items-center justify-center h-64 text-gray-400">Loading profile...</div>
      </div>
    );
  }

  if (error || !emp) {
    return (
      <div>
        <Topbar title="My Profile" />
        <div className="p-6 max-w-lg mx-auto mt-10">
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center space-y-3">
            <AlertCircle size={36} className="mx-auto text-yellow-500" />
            <h2 className="font-semibold text-gray-800">No Employee Profile Linked</h2>
            <p className="text-sm text-gray-500">
              Your user account is not linked to an employee record yet.
              Please ask your HR admin to link your account in the employee profile.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const balanceMap = Object.fromEntries(leaveBalances.map((b: any) => [b.leave_type_id, b]));

  return (
    <div>
      <Topbar title="My Profile" />
      <div className="p-6 max-w-3xl mx-auto space-y-5">

        {/* Profile Header */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 flex items-center gap-5">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
            {emp.full_name?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">{emp.full_name}</h1>
            <p className="text-sm text-gray-500">{emp.designation || "—"} {emp.department_name ? `· ${emp.department_name}` : ""}</p>
            <div className="flex gap-4 mt-2 flex-wrap">
              {emp.email && <span className="flex items-center gap-1 text-xs text-gray-400"><Mail size={12} />{emp.email}</span>}
              {emp.phone && <span className="flex items-center gap-1 text-xs text-gray-400"><Phone size={12} />{emp.phone}</span>}
            </div>
          </div>
          <div className="text-right">
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${emp.employment_status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
              {emp.employment_status?.replace("_", " ")}
            </span>
            <p className="text-xs text-gray-400 mt-1">{emp.employee_no}</p>
          </div>
        </div>

        {/* Leave Balances */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2"><Calendar size={16} />Leave Balance</h2>
            <button
              onClick={() => setLeaveModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus size={13} /> Apply Leave
            </button>
          </div>
          {leaveTypes.length === 0 ? (
            <p className="text-sm text-gray-400">No leave types configured yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {leaveTypes.map((lt: any) => {
                const bal = balanceMap[lt.id];
                const entitled = bal?.entitled_days ?? lt.days_per_year ?? 0;
                const taken = bal?.taken_days ?? 0;
                const remaining = entitled - taken;
                return (
                  <div key={lt.id} className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-500 font-medium">{lt.name}</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{remaining}</p>
                    <p className="text-xs text-gray-400">of {entitled} days remaining</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Leave Applications */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2"><FileText size={16} />Leave Applications</h2>
          {myLeave.length === 0 ? (
            <p className="text-sm text-gray-400">No leave applications yet.</p>
          ) : (
            <div className="space-y-2">
              {myLeave.slice(0, 5).map((l: any) => (
                <div key={l.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{l.leave_type_name || "Leave"}</p>
                    <p className="text-xs text-gray-400">{l.start_date} → {l.end_date} ({l.days} days)</p>
                    {l.reason && <p className="text-xs text-gray-400 italic">{l.reason}</p>}
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLOR[l.status] ?? "bg-gray-100 text-gray-500"}`}>
                    {l.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Claims shortcut */}
        <Link href="/my-claims" className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center justify-between hover:bg-gray-50 transition-colors group">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
              <Briefcase size={18} className="text-orange-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-800">My Claims</p>
              <p className="text-xs text-gray-400">{myClaims.filter((c: any) => c.status === "pending").length} pending · {myClaims.length} total</p>
            </div>
          </div>
          <ChevronRight size={18} className="text-gray-300 group-hover:text-gray-500" />
        </Link>

        {/* Personal Details */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2"><User size={16} />Personal Details</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <FIELD label="IC No." value={emp.ic_no} />
            <FIELD label="Date of Birth" value={emp.date_of_birth} />
            <FIELD label="Gender" value={emp.gender} />
            <FIELD label="Nationality" value={emp.nationality} />
            <FIELD label="Religion" value={emp.religion} />
            <FIELD label="Marital Status" value={emp.marital_status} />
          </div>
          {emp.address && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide flex items-center gap-1"><MapPin size={11} />Address</p>
              <p className="text-sm text-gray-800 mt-0.5">{emp.address}</p>
            </div>
          )}
        </div>

        {/* Employment Details */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2"><Briefcase size={16} />Employment Details</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <FIELD label="Employee No." value={emp.employee_no} />
            <FIELD label="Join Date" value={emp.join_date} />
            <FIELD label="Employment Type" value={emp.employment_type?.replace("_", "-")} />
            <FIELD label="Department" value={emp.department_name} />
            <FIELD label="Designation" value={emp.designation} />
            <FIELD label="Confirmation Date" value={emp.confirmation_date} />
          </div>
        </div>

      </div>

      {/* Apply Leave Modal */}
      {leaveModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold">Apply for Leave</h2>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Leave Type *</label>
              <select
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none"
                value={leaveForm.leave_type_id}
                onChange={(e) => setLeaveForm({ ...leaveForm, leave_type_id: e.target.value })}
              >
                <option value="">Select type</option>
                {leaveTypes.map((lt: any) => (
                  <option key={lt.id} value={lt.id}>{lt.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Start Date *</label>
                <input type="date" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
                  value={leaveForm.start_date} onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">End Date *</label>
                <input type="date" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
                  value={leaveForm.end_date} onChange={(e) => setLeaveForm({ ...leaveForm, end_date: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Reason</label>
              <textarea rows={2} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
                placeholder="Optional reason..."
                value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} />
            </div>
            {applyLeaveMutation.isError && <p className="text-sm text-red-500">Failed to submit. Please try again.</p>}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setLeaveModal(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button
                disabled={applyLeaveMutation.isPending}
                onClick={handleApplyLeave}
                className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {applyLeaveMutation.isPending ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
