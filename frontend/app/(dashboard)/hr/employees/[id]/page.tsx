"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hrApi } from "@/lib/api";
import { ChevronLeft, Upload, Trash2, Plus, ExternalLink } from "lucide-react";

const LABEL = "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1";
const INPUT = "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20";
const SELECT = "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none bg-white";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  probation: "bg-yellow-100 text-yellow-700",
  resigned: "bg-gray-100 text-gray-600",
  terminated: "bg-red-100 text-red-700",
};

export default function EmployeeDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"info" | "leave" | "docs">("info");
  const [docName, setDocName] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);

  const { data: emp, isLoading } = useQuery({
    queryKey: ["hr-employee", id],
    queryFn: () => hrApi.getEmployee(Number(id)),
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["hr-departments"],
    queryFn: hrApi.listDepartments,
  });

  const { data: documents = [], refetch: refetchDocs } = useQuery({
    queryKey: ["hr-employee-docs", id],
    queryFn: () => hrApi.listDocuments(Number(id)),
    enabled: tab === "docs",
  });

  const { data: leaveBalances = [] } = useQuery({
    queryKey: ["hr-leave-balances", id],
    queryFn: () => hrApi.listLeaveBalances({ employee_id: id, year: new Date().getFullYear() }),
    enabled: tab === "leave",
  });

  const [form, setForm] = useState<any>(null);
  const set = (k: string, v: any) => setForm((prev: any) => ({ ...prev, [k]: v }));

  // Initialize form when data loads
  if (emp && !form) {
    setForm({
      employee_no: emp.employee_no || "",
      full_name: emp.full_name || "",
      department_id: emp.department_id || "",
      designation: emp.designation || "",
      employment_type: emp.employment_type || "full_time",
      employment_status: emp.employment_status || "active",
      join_date: emp.join_date || "",
      confirmation_date: emp.confirmation_date || "",
      email: emp.email || "",
      phone: emp.phone || "",
      ic_no: emp.ic_no || "",
      passport_no: emp.passport_no || "",
      date_of_birth: emp.date_of_birth || "",
      gender: emp.gender || "",
      nationality: emp.nationality || "Malaysian",
      religion: emp.religion || "",
      marital_status: emp.marital_status || "",
      address: emp.address || "",
      emergency_contact_name: emp.emergency_contact_name || "",
      emergency_contact_phone: emp.emergency_contact_phone || "",
      emergency_contact_relation: emp.emergency_contact_relation || "",
      basic_salary: emp.basic_salary || "",
      bank_name: emp.bank_name || "",
      bank_account_no: emp.bank_account_no || "",
      epf_no: emp.epf_no || "",
      socso_no: emp.socso_no || "",
      income_tax_no: emp.income_tax_no || "",
      children_count: emp.children_count || 0,
      spouse_working: emp.spouse_working || false,
    });
  }

  const updateMutation = useMutation({
    mutationFn: (data: object) => hrApi.updateEmployee(Number(id), data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-employee", id] });
      qc.invalidateQueries({ queryKey: ["hr-employees"] });
      alert("Saved successfully");
    },
  });

  const photoMutation = useMutation({
    mutationFn: (file: File) => hrApi.uploadPhoto(Number(id), file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr-employee", id] }),
  });

  const uploadDocMutation = useMutation({
    mutationFn: ({ name, file }: { name: string; file: File }) =>
      hrApi.uploadDocument(Number(id), name, file),
    onSuccess: () => {
      refetchDocs();
      setDocName("");
      setDocFile(null);
    },
  });

  const deleteDocMutation = useMutation({
    mutationFn: (docId: number) => hrApi.deleteDocument(Number(id), docId),
    onSuccess: () => refetchDocs(),
  });

  const handleSave = () => {
    if (!form) return;
    const data: any = { ...form };
    if (data.department_id) data.department_id = Number(data.department_id);
    else data.department_id = null;
    if (data.basic_salary) data.basic_salary = Number(data.basic_salary);
    if (data.children_count) data.children_count = Number(data.children_count);
    ["join_date", "confirmation_date", "date_of_birth"].forEach((k) => {
      if (!data[k]) data[k] = null;
    });
    updateMutation.mutate(data);
  };

  if (isLoading || !emp || !form) {
    return <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Loading...</div>;
  }

  const TABS = [
    { key: "info", label: "Information" },
    { key: "leave", label: "Leave Balances" },
    { key: "docs", label: "Documents" },
  ] as const;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 mt-1">
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1 flex items-center gap-4">
          <label className="cursor-pointer">
            {emp.photo_url ? (
              <img src={emp.photo_url} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-white shadow" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xl font-semibold shadow">
                {emp.full_name.charAt(0)}
              </div>
            )}
            <input type="file" accept="image/*" className="hidden" onChange={e => {
              const f = e.target.files?.[0];
              if (f) photoMutation.mutate(f);
            }} />
          </label>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{emp.full_name}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-sm text-gray-500">{emp.employee_no}</span>
              {emp.designation && <span className="text-sm text-gray-400">· {emp.designation}</span>}
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[emp.employment_status] || "bg-gray-100 text-gray-600"}`}>
                {emp.employment_status}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="px-4 py-2 text-sm font-medium bg-[#1a1a2e] text-white rounded-lg hover:bg-[#2a2a3e] disabled:opacity-50"
        >
          {updateMutation.isPending ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* INFO TAB */}
      {tab === "info" && (
        <div className="space-y-4">
          {/* Employment */}
          <div className="bg-white rounded-xl border border-gray-100">
            <div className="px-6 py-4 border-b border-gray-50"><h2 className="text-sm font-semibold text-gray-700">Employment</h2></div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className={LABEL}>Employee No.</label><input className={INPUT} value={form.employee_no} onChange={e => set("employee_no", e.target.value)} /></div>
                <div><label className={LABEL}>Full Name</label><input className={INPUT} value={form.full_name} onChange={e => set("full_name", e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Department</label>
                  <select className={SELECT} value={form.department_id} onChange={e => set("department_id", e.target.value)}>
                    <option value="">None</option>
                    {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div><label className={LABEL}>Designation</label><input className={INPUT} value={form.designation} onChange={e => set("designation", e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Employment Type</label>
                  <select className={SELECT} value={form.employment_type} onChange={e => set("employment_type", e.target.value)}>
                    <option value="full_time">Full-time</option>
                    <option value="part_time">Part-time</option>
                    <option value="contract">Contract</option>
                    <option value="intern">Intern</option>
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Status</label>
                  <select className={SELECT} value={form.employment_status} onChange={e => set("employment_status", e.target.value)}>
                    <option value="probation">Probation</option>
                    <option value="active">Active</option>
                    <option value="resigned">Resigned</option>
                    <option value="terminated">Terminated</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className={LABEL}>Join Date</label><input type="date" className={INPUT} value={form.join_date} onChange={e => set("join_date", e.target.value)} /></div>
                <div><label className={LABEL}>Confirmation Date</label><input type="date" className={INPUT} value={form.confirmation_date} onChange={e => set("confirmation_date", e.target.value)} /></div>
              </div>
            </div>
          </div>

          {/* Personal */}
          <div className="bg-white rounded-xl border border-gray-100">
            <div className="px-6 py-4 border-b border-gray-50"><h2 className="text-sm font-semibold text-gray-700">Personal</h2></div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className={LABEL}>Email</label><input type="email" className={INPUT} value={form.email} onChange={e => set("email", e.target.value)} /></div>
                <div><label className={LABEL}>Phone</label><input className={INPUT} value={form.phone} onChange={e => set("phone", e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className={LABEL}>IC No.</label><input className={INPUT} value={form.ic_no} onChange={e => set("ic_no", e.target.value)} /></div>
                <div><label className={LABEL}>Date of Birth</label><input type="date" className={INPUT} value={form.date_of_birth} onChange={e => set("date_of_birth", e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Gender</label>
                  <select className={SELECT} value={form.gender} onChange={e => set("gender", e.target.value)}>
                    <option value="">—</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Marital Status</label>
                  <select className={SELECT} value={form.marital_status} onChange={e => set("marital_status", e.target.value)}>
                    <option value="">—</option>
                    <option value="single">Single</option>
                    <option value="married">Married</option>
                    <option value="divorced">Divorced</option>
                    <option value="widowed">Widowed</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className={LABEL}>Nationality</label><input className={INPUT} value={form.nationality} onChange={e => set("nationality", e.target.value)} /></div>
                <div><label className={LABEL}>Religion</label><input className={INPUT} value={form.religion} onChange={e => set("religion", e.target.value)} /></div>
              </div>
              <div><label className={LABEL}>Address</label><textarea rows={2} className={INPUT} value={form.address} onChange={e => set("address", e.target.value)} /></div>
              <div className="grid grid-cols-3 gap-4">
                <div><label className={LABEL}>Emergency Contact</label><input className={INPUT} value={form.emergency_contact_name} onChange={e => set("emergency_contact_name", e.target.value)} placeholder="Name" /></div>
                <div><label className={LABEL}>Phone</label><input className={INPUT} value={form.emergency_contact_phone} onChange={e => set("emergency_contact_phone", e.target.value)} /></div>
                <div><label className={LABEL}>Relation</label><input className={INPUT} value={form.emergency_contact_relation} onChange={e => set("emergency_contact_relation", e.target.value)} /></div>
              </div>
            </div>
          </div>

          {/* Payroll */}
          <div className="bg-white rounded-xl border border-gray-100">
            <div className="px-6 py-4 border-b border-gray-50"><h2 className="text-sm font-semibold text-gray-700">Payroll</h2></div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className={LABEL}>Basic Salary (MYR)</label><input type="number" step="0.01" className={INPUT} value={form.basic_salary} onChange={e => set("basic_salary", e.target.value)} /></div>
                <div><label className={LABEL}>Bank Name</label><input className={INPUT} value={form.bank_name} onChange={e => set("bank_name", e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className={LABEL}>Bank Account No.</label><input className={INPUT} value={form.bank_account_no} onChange={e => set("bank_account_no", e.target.value)} /></div>
                <div><label className={LABEL}>EPF No.</label><input className={INPUT} value={form.epf_no} onChange={e => set("epf_no", e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className={LABEL}>SOCSO No.</label><input className={INPUT} value={form.socso_no} onChange={e => set("socso_no", e.target.value)} /></div>
                <div><label className={LABEL}>Income Tax No.</label><input className={INPUT} value={form.income_tax_no} onChange={e => set("income_tax_no", e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className={LABEL}>No. of Children</label><input type="number" min="0" className={INPUT} value={form.children_count} onChange={e => set("children_count", e.target.value)} /></div>
                <div className="flex items-center gap-3 pt-5">
                  <input type="checkbox" id="spouse_working" checked={form.spouse_working} onChange={e => set("spouse_working", e.target.checked)} className="w-4 h-4" />
                  <label htmlFor="spouse_working" className="text-sm text-gray-700">Spouse is working</label>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LEAVE TAB */}
      {tab === "leave" && (
        <div className="bg-white rounded-xl border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-50 flex justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Leave Balances — {new Date().getFullYear()}</h2>
          </div>
          {leaveBalances.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">No leave balances set for this year</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Leave Type</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Entitled</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Taken</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Balance</th>
                </tr>
              </thead>
              <tbody>
                {leaveBalances.map((b: any) => (
                  <tr key={b.id} className="border-b border-gray-50">
                    <td className="px-4 py-3 font-medium">{b.leave_type_name}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{b.entitled} days</td>
                    <td className="px-4 py-3 text-right text-orange-600">{b.taken} days</td>
                    <td className="px-4 py-3 text-right font-semibold text-green-700">{b.balance} days</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* DOCS TAB */}
      {tab === "docs" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Upload Document</h2>
            <div className="flex gap-3">
              <input placeholder="Document name (e.g. Offer Letter)" className={`${INPUT} flex-1`} value={docName} onChange={e => setDocName(e.target.value)} />
              <label className="flex items-center gap-2 px-4 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 cursor-pointer hover:bg-gray-50">
                <Upload size={14} />
                {docFile ? docFile.name : "Choose file"}
                <input type="file" className="hidden" onChange={e => setDocFile(e.target.files?.[0] || null)} />
              </label>
              <button
                disabled={!docName || !docFile || uploadDocMutation.isPending}
                onClick={() => docFile && uploadDocMutation.mutate({ name: docName, file: docFile })}
                className="px-4 py-2 text-sm bg-[#1a1a2e] text-white rounded-lg disabled:opacity-40"
              >
                Upload
              </button>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {documents.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">No documents uploaded</div>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {documents.map((doc: any) => (
                    <tr key={doc.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{doc.name}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{new Date(doc.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700">
                            <ExternalLink size={14} />
                          </a>
                          <button onClick={() => deleteDocMutation.mutate(doc.id)} className="text-red-400 hover:text-red-600">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
