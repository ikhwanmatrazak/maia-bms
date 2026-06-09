"use client";

import { Topbar } from "@/components/ui/Topbar";
import { DetailSkeleton } from "@/components/ui/PageSkeleton";
import { useState, useRef, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hrApi, designationsApi } from "@/lib/api";
import { ChevronLeft, Upload, Trash2, Plus, ExternalLink, FileText } from "lucide-react";

const LABEL = "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1";
const INPUT = "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20";
const SELECT = "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none bg-white";

// ── HR number format validators ──────────────────────────────────────────────
// Income Tax No: 1–2 uppercase letters + optional space/dash + 7–12 digits
// e.g. SG12345678, OG 12345678, D1234567890, TA1234567890
const INCOME_TAX_RE = /^[A-Za-z]{1,2}[\s-]?\d{7,12}$/;
// SOCSO No: 10 digits (old format) OR 12 digits (new format = IC No)
const SOCSO_RE = /^\d{10,12}$/;
// EPF/KWSP No: 7–14 numeric digits
const EPF_RE = /^\d{7,14}$/;

function validateIncomeTax(v: string): string | null {
  if (!v) return null;
  const clean = v.trim();
  if (!INCOME_TAX_RE.test(clean)) return "Format: 1–2 letters + 7–12 digits (e.g. SG12345678, D1234567890)";
  return null;
}
function validateSocso(v: string): string | null {
  if (!v) return null;
  if (!SOCSO_RE.test(v.trim().replace(/[-\s]/g, ""))) return "SOCSO No. must be 10–12 digits (IC No. accepted)";
  return null;
}
function validateEpf(v: string): string | null {
  if (!v) return null;
  if (!EPF_RE.test(v.trim())) return "EPF/KWSP No. must be 7–14 digits";
  return null;
}

function ValidatedInput({ label, value, onChange, validate, placeholder }: {
  label: string; value: string; placeholder?: string;
  onChange: (v: string) => void;
  validate: (v: string) => string | null;
}) {
  const error = validate(value);
  const isValid = value.trim() !== "" && !error;
  return (
    <div>
      <label className={LABEL}>{label}</label>
      <div className="relative">
        <input
          className={`${INPUT} pr-8 ${error ? "border-red-400 focus:ring-red-400/20" : ""}`}
          value={value} placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
        />
        {error && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-red-400 text-sm">✕</span>
        )}
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

function ReportingToCombobox({ value, onChange, employees }: {
  value: string;
  onChange: (name: string, position?: string) => void;
  employees: any[];
}) {
  const [search, setSearch] = useState(value);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setSearch(value); }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = employees.filter((e) =>
    e.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    e.position?.toLowerCase().includes(search.toLowerCase()) ||
    e.designation?.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 10);

  return (
    <div ref={ref} className="relative">
      <input
        className={INPUT}
        value={search}
        placeholder="Search employee or type name…"
        onChange={(e) => { setSearch(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((e) => (
            <button
              key={e.id}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm flex flex-col"
              onMouseDown={() => {
                const pos = e.designation || e.position || "";
                onChange(e.full_name, pos);
                setSearch(e.full_name);
                setOpen(false);
              }}
            >
              <span className="font-medium text-gray-800">{e.full_name}</span>
              {(e.designation || e.position) && <span className="text-xs text-gray-400">{e.designation || e.position}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DesignationCombobox({ value, jobResp, onChange, onJobRespChange, designations }: {
  value: string; jobResp: string;
  onChange: (name: string, id: number | null, jr: string) => void;
  onJobRespChange: (jr: string) => void;
  designations: { id: number; name: string; job_responsibilities?: string }[];
}) {
  const [search, setSearch] = useState(value);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setSearch(value); }, [value]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const filtered = designations.filter(d => d.name.toLowerCase().includes(search.toLowerCase())).slice(0, 8);
  const showCreate = search.trim() && !designations.some(d => d.name.toLowerCase() === search.trim().toLowerCase());

  return (
    <div className="space-y-2">
      <div className="relative" ref={ref}>
        <input
          className={INPUT} value={search} placeholder="Type or select designation…"
          onChange={e => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
        {open && (filtered.length > 0 || showCreate) && (
          <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {filtered.map(d => (
              <button key={d.id} type="button" className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm"
                onMouseDown={() => { onChange(d.name, d.id, d.job_responsibilities || ""); setSearch(d.name); setOpen(false); }}>
                {d.name}
              </button>
            ))}
            {showCreate && (
              <button type="button" className="w-full text-left px-3 py-2 hover:bg-green-50 text-sm text-green-700 font-medium border-t border-gray-100"
                onMouseDown={async () => {
                  try {
                    const created = await designationsApi.create({ name: search.trim(), job_responsibilities: jobResp });
                    onChange(created.name, created.id, created.job_responsibilities || "");
                    setSearch(created.name); setOpen(false);
                  } catch { alert("Failed to create designation"); }
                }}>
                + Create &quot;{search.trim()}&quot;
              </button>
            )}
          </div>
        )}
      </div>
      <div>
        <label className={LABEL + " mt-1"}>Job Responsibilities <span className="font-normal normal-case text-gray-400">(one per line → bullet in PDF)</span></label>
        <textarea rows={5} className={INPUT + " resize-y"} value={jobResp} placeholder={"Leading design and development of applications\nEnsuring high performance and quality\nResolving bugs and bottlenecks"}
          onChange={e => onJobRespChange(e.target.value)}
          onBlur={async () => {
            const des = designations.find(d => d.name === value);
            if (des) {
              try { await designationsApi.update(des.id, { job_responsibilities: jobResp }); } catch { alert("Failed to save job responsibilities"); }
            }
          }}
        />
        <p className="text-xs text-gray-400 mt-1">Changes auto-save when you click away. All employees with this designation share these responsibilities.</p>
      </div>
    </div>
  );
}

function LeaveBalancesTab({ empId, emp, leaveBalances, refetchLeave }: { empId: number; emp: any; leaveBalances: any[]; refetchLeave: () => void }) {
  const year = new Date().getFullYear();
  const [prorating, setProrating] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const loadPreview = async () => {
    setProrating(true);
    try {
      const data = await hrApi.getProratePreview(empId, year);
      setPreview(data);
      setPreviewOpen(true);
    } finally {
      setProrating(false);
    }
  };

  const applyProrate = async () => {
    setProrating(true);
    try {
      const result = await hrApi.applyProrate(empId, year);
      refetchLeave();
      setPreviewOpen(false);
      alert(`Applied: ${result.updated.map((u: any) => `${u.leave_type} → ${u.entitled} days`).join(", ") || "No pro-rated types updated"}`);
    } catch (e: any) {
      alert(`Failed to apply: ${e?.response?.data?.detail || e?.message || "Unknown error"}`);
    } finally {
      setProrating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Leave Balances — {year}</h2>
            {emp.join_date && <p className="text-xs text-gray-400 mt-0.5">Join date: {emp.join_date}</p>}
          </div>
          <button
            onClick={loadPreview}
            disabled={prorating}
            className="px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-50"
          >
            {prorating ? "Calculating..." : "Auto Pro-rate"}
          </button>
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

      {/* Pro-rate preview modal */}
      {previewOpen && preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">Pro-rated Leave Preview</h3>
              <p className="text-xs text-gray-500 mt-1">
                {preview.employee_name} · Join: {preview.join_date} · <strong>{preview.months_worked} completed months</strong> as of today
              </p>
            </div>
            <div className="px-6 py-4">
              {preview.breakdown.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No leave types are marked as pro-rated.<br />Go to HR → Leave → Leave Types and enable "Pro-rated" on the relevant types.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 text-xs text-gray-500 font-semibold">Leave Type</th>
                      <th className="text-right py-2 text-xs text-gray-500 font-semibold">Rate/mo</th>
                      <th className="text-right py-2 text-xs text-gray-500 font-semibold">Entitled</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.breakdown.map((r: any) => (
                      <tr key={r.leave_type_id} className="border-b border-gray-50">
                        <td className="py-2.5 font-medium">{r.leave_type_name}</td>
                        <td className="py-2.5 text-right text-gray-500">{r.monthly_rate.toFixed(4)}</td>
                        <td className="py-2.5 text-right font-semibold text-blue-700">{r.entitled} days</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setPreviewOpen(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              {preview.breakdown.length > 0 && (
                <button onClick={applyProrate} disabled={prorating}
                  className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {prorating ? "Applying..." : "Apply to Balances"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => import("@/lib/api").then((m) => m.api.get("/users").then((r) => r.data)),
  });

  const { data: allEmployees = [] } = useQuery<any[]>({
    queryKey: ["hr-employees-all"],
    queryFn: () => hrApi.listEmployees(),
  });

  const { data: designations = [], refetch: refetchDesignations } = useQuery<{ id: number; name: string; job_responsibilities?: string }[]>({
    queryKey: ["hr-designations"],
    queryFn: designationsApi.list,
  });

  const { data: termsDefaults } = useQuery<Record<string, number>>({
    queryKey: ["hr-employment-terms-defaults"],
    queryFn: hrApi.getEmploymentTermsDefaults,
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
  const setUserLink = (userId: string) => {
    const user = (users as any[]).find((u: any) => String(u.id) === userId);
    setForm((prev: any) => ({ ...prev, user_id: userId, email: user ? user.email : prev.email }));
  };

  // Pre-fill offer letter fields from saved employee data
  useEffect(() => {
    if (!emp) return;
    if (emp.work_location) setOffer("work_location", emp.work_location);
    if (emp.reporting_to) setOffer("reporting_to", emp.reporting_to);
    if (emp.offer_benefits && Array.isArray(emp.offer_benefits) && emp.offer_benefits.length > 0) {
      setOffer("benefits", emp.offer_benefits);
    }
  }, [emp]);

  // Initialize form when employee data loads or employee changes
  useEffect(() => {
    if (!emp) return;
    setForm({
      employee_no: emp.employee_no || "",
      full_name: emp.full_name || "",
      department_id: emp.department_id || "",
      designation: emp.designation || "",
      designation_id: emp.designation_id || null,
      employment_type: emp.employment_type || "full_time",
      employment_status: emp.employment_status || "active",
      join_date: emp.join_date || "",
      confirmation_date: emp.confirmation_date || "",
      contract_end_date: emp.contract_end_date || "",
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
      user_id: emp.user_id ?? "",
      has_epf: emp.has_epf !== false,
      has_socso_eis: emp.has_socso_eis !== false,
      has_income_tax: emp.has_income_tax !== false,
    });
    // Pre-fill job responsibilities from designation
    if (emp.designation_id) {
      const des = (designations as any[]).find((d: any) => d.id === emp.designation_id);
      if (des) setDesignationJobResp(des.job_responsibilities || "");
    }
    // Load employment terms: company defaults overlaid with employee-specific values
    const empTerms = (emp.employment_terms || {}) as Record<string, number>;
    const compTerms = (termsDefaults || {}) as Record<string, number>;
    setTermsForm(prev => ({
      ...prev,
      ...compTerms,
      ...empTerms,
    }));
  }, [emp?.id, termsDefaults]);

  const updateMutation = useMutation({
    mutationFn: (data: object) => hrApi.updateEmployee(Number(id), data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-employee", id] });
      qc.invalidateQueries({ queryKey: ["hr-employees"] });
      alert("Saved successfully");
    },
    onError: (err: any) => {
      alert("Failed to save: " + (err?.response?.data?.detail || err?.message || "Unknown error"));
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

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [offerGenerating, setOfferGenerating] = useState(false);
  const [termsGenerating, setTermsGenerating] = useState(false);
  const [termsForm, setTermsForm] = useState({
    notice_period_days: 60,
    outpatient_employee_limit: 1500, outpatient_dependent_limit: 1000, outpatient_per_receipt: 300,
    hospitalization_employee_limit: 3000, hospitalization_dependent_limit: 2000, hospitalization_per_receipt: 1000,
    dental_limit: 200, newborn_allowance: 1000, newborn_max: 3,
    travel_tier1_km: 100, travel_tier1_rate: 0.70, travel_tier2_rate: 0.50,
  });
  const setTerms = (k: string, v: any) => setTermsForm(p => ({ ...p, [k]: v }));
  const [designationJobResp, setDesignationJobResp] = useState("");

  const [offerForm, setOfferForm] = useState({
    position: "", department: "", reporting_to: "", work_location: "",
    employment_type: "Full-Time", start_date: "", probation_months: 3,
    basic_salary: "", allowances: [] as { name: string; amount: string }[],
    benefits: [
      { name: "Annual Leave", value: "" },
      { name: "Medical Leave", value: "" },
      { name: "Medical Benefits", value: "" },
    ] as { name: string; value: string }[],
    expiry_date: "", signatory_name: "", signatory_title: "Human Resource Manager", notes: "",
  });
  const setOffer = (k: string, v: any) => setOfferForm((p) => ({ ...p, [k]: v }));

  const handleGenerateOffer = async () => {
    if (!form.join_date || !effectiveExpiry) return;
    setOfferGenerating(true);
    try {
      await hrApi.generateOfferLetter(Number(id), {
        // Pull from employee form (no duplication)
        position: form.designation || "",
        department: emp.department_name || "",
        employment_type: form.employment_type || "Full-Time",
        basic_salary: Number(form.basic_salary) || 0,
        probation_months: Number(form.probation_months) || 0,
        start_date: form.join_date,
        // Offer-letter-only fields
        reporting_to: offerForm.reporting_to,
        work_location: offerForm.work_location,
        expiry_date: effectiveExpiry,
        allowances: offerForm.allowances.filter(a => a.name && a.amount).map(a => ({ name: a.name, amount: Number(a.amount) })),
        benefits: offerForm.benefits,
        signatory_name: offerForm.signatory_name,
        signatory_title: offerForm.signatory_title,
        notes: offerForm.notes,
        conditions: [
          "This offer is subject to satisfactory reference checks and medical examination.",
          "You are required to give adequate notice as per the Employment Act if you wish to resign.",
          "All confidential information relating to the company must be kept strictly confidential.",
        ],
      });
    } finally {
      setOfferGenerating(false);
    }
  };
  const handleGenerateTerms = async () => {
    setTermsGenerating(true);
    try {
      await hrApi.generateEmploymentTerms(Number(id), termsForm);
    } finally {
      setTermsGenerating(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: () => hrApi.deleteEmployee(Number(id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-employees"] });
      router.push("/hr/employees");
    },
  });

  const handleSave = () => {
    if (!form) return;
    if (form.epf_no && validateEpf(form.epf_no)) { alert(`EPF No.: ${validateEpf(form.epf_no)}`); return; }
    if (form.socso_no && validateSocso(form.socso_no)) { alert(`SOCSO No.: ${validateSocso(form.socso_no)}`); return; }
    if (form.income_tax_no && validateIncomeTax(form.income_tax_no)) { alert(`Income Tax No.: ${validateIncomeTax(form.income_tax_no)}`); return; }
    const data: any = { ...form };
    // Convert numeric fields — send null instead of empty string
    data.department_id = data.department_id ? Number(data.department_id) : null;
    data.basic_salary = data.basic_salary !== "" && data.basic_salary != null ? Number(data.basic_salary) : null;
    data.children_count = data.children_count !== "" && data.children_count != null ? Number(data.children_count) : 0;
    data.user_id = data.user_id ? Number(data.user_id) : null;
    // Convert empty strings to null for optional string/date fields
    ["join_date", "confirmation_date", "contract_end_date", "date_of_birth", "phone", "ic_no", "passport_no",
     "gender", "nationality", "religion", "marital_status", "address",
     "emergency_contact_name", "emergency_contact_phone", "emergency_contact_relation",
     "bank_name", "bank_account_no", "epf_no", "socso_no", "income_tax_no", "designation"].forEach((k) => {
      if (data[k] === "") data[k] = null;
    });
    data.employment_terms = termsForm;
    data.reporting_to = offerForm.reporting_to || null;
    data.work_location = offerForm.work_location || null;
    data.offer_benefits = offerForm.benefits.length > 0 ? offerForm.benefits : null;
    // Save job responsibilities to the designation (if one is selected)
    if (form.designation_id && designationJobResp !== undefined) {
      designationsApi.update(Number(form.designation_id), { job_responsibilities: designationJobResp })
        .catch(() => alert("Failed to save job responsibilities"));
    }
    updateMutation.mutate(data);
  };

  if (isLoading || !emp || !form) return (
    <div>
      <Topbar title="Employee" />
      <div className="p-6"><DetailSkeleton /></div>
    </div>
  );

  const isContract = form.employment_type === "contract";
  const isFullTime = form.employment_type === "full-time" || form.employment_type === "Full-Time";
  // Contract uses contract_end_date from above; part-time/intern show expiry field; full-time has no end date
  const effectiveExpiry = isContract ? form.contract_end_date : (!isFullTime ? offerForm.expiry_date : null);
  const showExpiryField = !isContract && !isFullTime;

  const TABS = [
    { key: "info", label: "Information" },
    { key: "leave", label: "Leave Balances" },
    { key: "docs", label: "Documents" },
  ] as const;

  return (
    <div>
    <Topbar title="Employee Profile" />
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
        <div className="flex gap-2">
          {confirmDelete ? (
            <>
              <button onClick={() => setConfirmDelete(false)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="px-3 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >{deleteMutation.isPending ? "Deleting..." : "Confirm Delete"}</button>
            </>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="px-3 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50">
              <Trash2 size={15} className="inline mr-1" />Delete
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="px-4 py-2 text-sm font-medium bg-[#1a1a2e] text-white rounded-lg hover:bg-[#2a2a3e] disabled:opacity-50"
          >
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </button>
        </div>
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
                <div className="col-span-2">
                  <label className={LABEL}>Designation</label>
                  <DesignationCombobox
                    value={form.designation || ""}
                    jobResp={designationJobResp}
                    designations={designations}
                    onChange={(name, desId, jr) => { set("designation", name); set("designation_id", desId); setDesignationJobResp(jr); refetchDesignations(); }}
                    onJobRespChange={setDesignationJobResp}
                  />
                </div>
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
              {form.employment_type === "contract" && (
                <div>
                  <label className={LABEL}>Contract End Date</label>
                  <div className="flex gap-2 items-center flex-wrap">
                    <input type="date" className={`${INPUT} flex-1 min-w-[160px]`} value={form.contract_end_date} onChange={e => set("contract_end_date", e.target.value)} />
                    {["3 months", "6 months", "1 year", "2 years"].map(label => {
                      const base = form.join_date ? new Date(form.join_date) : new Date();
                      const d = new Date(base);
                      if (label === "3 months") d.setMonth(d.getMonth() + 3);
                      else if (label === "6 months") d.setMonth(d.getMonth() + 6);
                      else if (label === "1 year") d.setFullYear(d.getFullYear() + 1);
                      else if (label === "2 years") d.setFullYear(d.getFullYear() + 2);
                      const pad = (n: number) => String(n).padStart(2, "0");
                      const val = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                      return (
                        <button key={label} type="button" onClick={() => set("contract_end_date", val)}
                          className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors">
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Quick-set from join date, or pick a custom date above.</p>
                </div>
              )}
              <div>
                <label className={LABEL}>Linked User Account</label>
                <select className={SELECT} value={form.user_id} onChange={e => setUserLink(e.target.value)}>
                  <option value="">— None —</option>
                  {(users as any[]).map((u: any) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">Link this employee to a login account so they can access their HR profile, payslips, and leave.</p>
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
                <div><label className={LABEL}>IC No.</label><input className={INPUT} value={form.ic_no} onChange={e => {
                  const val = e.target.value;
                  set("ic_no", val);
                  // Auto-populate SOCSO No from IC No (digits only)
                  const digits = val.replace(/\D/g, "");
                  if (digits.length === 12 && !form.socso_no) set("socso_no", digits);
                }} /></div>
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
                <ValidatedInput label="EPF No." value={form.epf_no} onChange={v => set("epf_no", v)} validate={validateEpf} placeholder="e.g. 1234567" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <ValidatedInput label="SOCSO No. (auto from IC No.)" value={form.socso_no} onChange={v => set("socso_no", v)} validate={validateSocso} placeholder="Same as IC No. (12 digits)" />
                <ValidatedInput label="Income Tax No." value={form.income_tax_no} onChange={v => set("income_tax_no", v)} validate={validateIncomeTax} placeholder="e.g. SG12345678" />
              </div>
              <div>
                <label className={LABEL}>Statutory Deductions</label>
                <div className="flex flex-wrap gap-6 mt-1">
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={!!form.has_epf} onChange={e => set("has_epf", e.target.checked)} className="w-4 h-4" />
                    EPF / KWSP
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={!!form.has_socso_eis} onChange={e => set("has_socso_eis", e.target.checked)} className="w-4 h-4" />
                    SOCSO &amp; EIS
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={!!form.has_income_tax} onChange={e => set("has_income_tax", e.target.checked)} className="w-4 h-4" />
                    Income Tax (PCB)
                  </label>
                </div>
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
          {/* Offer Letter */}
          <div className="bg-white rounded-xl border border-gray-100">
            <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-700">Offer Letter</h2>
                <p className="text-xs text-gray-400 mt-0.5">Uses designation, salary, employment type & join date from above</p>
              </div>
              <button
                onClick={handleGenerateOffer}
                disabled={offerGenerating || !form.join_date || (showExpiryField && !offerForm.expiry_date)}
                className="px-4 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                <FileText size={13} />
                {offerGenerating ? "Generating..." : "Generate PDF"}
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Reporting To</label>
                  <ReportingToCombobox
                    value={offerForm.reporting_to}
                    onChange={(v) => setOffer("reporting_to", v)}
                    employees={allEmployees.filter((e: any) => e.id !== Number(id))}
                  />
                </div>
                <div>
                  <label className={LABEL}>Work Location</label>
                  <input className={INPUT} value={offerForm.work_location} onChange={e => setOffer("work_location", e.target.value)} placeholder="e.g. Kuala Lumpur" />
                </div>
                {showExpiryField && (
                  <div>
                    <label className={LABEL}>Offer Expiry Date <span className="text-red-400">*</span></label>
                    <input type="date" className={INPUT} value={offerForm.expiry_date} onChange={e => setOffer("expiry_date", e.target.value)} />
                  </div>
                )}
              </div>
              <div>
                <label className={LABEL}>Allowances</label>
                <div className="space-y-2">
                  {offerForm.allowances.map((a, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input className={`${INPUT} flex-1`} placeholder="Name (e.g. Transport)" value={a.name} onChange={e => {
                        const arr = [...offerForm.allowances]; arr[i] = { ...arr[i], name: e.target.value }; setOffer("allowances", arr);
                      }} />
                      <input type="number" step="0.01" className={`${INPUT} w-32`} placeholder="Amount" value={a.amount} onChange={e => {
                        const arr = [...offerForm.allowances]; arr[i] = { ...arr[i], amount: e.target.value }; setOffer("allowances", arr);
                      }} />
                      <button onClick={() => setOffer("allowances", offerForm.allowances.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 shrink-0"><Trash2 size={14} /></button>
                    </div>
                  ))}
                  <button onClick={() => setOffer("allowances", [...offerForm.allowances, { name: "", amount: "" }])} className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium">
                    <Plus size={14} /> Add Allowance
                  </button>
                </div>
              </div>
              <div>
                <label className={LABEL}>Benefits</label>
                <div className="space-y-2 mt-1">
                  {offerForm.benefits.map((b, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        className={`${INPUT} flex-1`}
                        value={b.name}
                        onChange={e => { const arr = [...offerForm.benefits]; arr[i] = { ...arr[i], name: e.target.value }; setOffer("benefits", arr); }}
                        placeholder="Benefit name"
                      />
                      <input
                        className={`${INPUT} flex-1`}
                        value={b.value}
                        onChange={e => { const arr = [...offerForm.benefits]; arr[i] = { ...arr[i], value: e.target.value }; setOffer("benefits", arr); }}
                        placeholder="e.g. 14 days per year"
                      />
                      <button onClick={() => setOffer("benefits", offerForm.benefits.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 shrink-0"><Trash2 size={14} /></button>
                    </div>
                  ))}
                  <button onClick={() => setOffer("benefits", [...offerForm.benefits, { name: "", value: "" }])} className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium">
                    <Plus size={14} /> Add Benefit
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Signatory Name</label>
                  <ReportingToCombobox
                    value={offerForm.signatory_name}
                    onChange={(name, position) => {
                      setOffer("signatory_name", name);
                      if (position) setOffer("signatory_title", position);
                    }}
                    employees={allEmployees}
                  />
                </div>
                <div>
                  <label className={LABEL}>Signatory Title</label>
                  <input className={INPUT} value={offerForm.signatory_title} onChange={e => setOffer("signatory_title", e.target.value)} placeholder="e.g. Human Resource Manager" />
                </div>
              </div>
              <div>
                <label className={LABEL}>Additional Notes</label>
                <textarea rows={2} className={INPUT} value={offerForm.notes} onChange={e => setOffer("notes", e.target.value)} placeholder="Any additional remarks..." />
              </div>
            </div>
          </div>

          {/* Employment Terms */}
          <div className="bg-white rounded-xl border border-gray-100">
            <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-700">Employment Terms</h2>
                <p className="text-xs text-gray-400 mt-0.5">Generate the standard employment terms & conditions PDF for this employee</p>
              </div>
              <button
                onClick={handleGenerateTerms}
                disabled={termsGenerating}
                className="px-4 py-1.5 text-sm font-medium bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50 flex items-center gap-1.5"
              >
                <FileText size={13} />
                {termsGenerating ? "Generating..." : "Generate Employment Terms"}
              </button>
            </div>
            <div className="px-6 py-5 space-y-5">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Notice Period</p>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className={LABEL}>Notice Period (days)</label>
                    <input type="number" className={INPUT} value={termsForm.notice_period_days} onChange={e => setTerms("notice_period_days", Number(e.target.value))} />
                  </div>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Outpatient Medical</p>
                <div className="grid grid-cols-3 gap-4">
                  <div><label className={LABEL}>Employee Limit (RM/yr)</label><input type="number" className={INPUT} value={termsForm.outpatient_employee_limit} onChange={e => setTerms("outpatient_employee_limit", Number(e.target.value))} /></div>
                  <div><label className={LABEL}>Dependent Limit (RM/yr)</label><input type="number" className={INPUT} value={termsForm.outpatient_dependent_limit} onChange={e => setTerms("outpatient_dependent_limit", Number(e.target.value))} /></div>
                  <div><label className={LABEL}>Per Receipt Max (RM)</label><input type="number" className={INPUT} value={termsForm.outpatient_per_receipt} onChange={e => setTerms("outpatient_per_receipt", Number(e.target.value))} /></div>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Hospitalization</p>
                <div className="grid grid-cols-3 gap-4">
                  <div><label className={LABEL}>Employee Limit (RM/yr)</label><input type="number" className={INPUT} value={termsForm.hospitalization_employee_limit} onChange={e => setTerms("hospitalization_employee_limit", Number(e.target.value))} /></div>
                  <div><label className={LABEL}>Dependent Limit (RM/yr)</label><input type="number" className={INPUT} value={termsForm.hospitalization_dependent_limit} onChange={e => setTerms("hospitalization_dependent_limit", Number(e.target.value))} /></div>
                  <div><label className={LABEL}>Per Receipt Max (RM)</label><input type="number" className={INPUT} value={termsForm.hospitalization_per_receipt} onChange={e => setTerms("hospitalization_per_receipt", Number(e.target.value))} /></div>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Dental &amp; Newborn</p>
                <div className="grid grid-cols-3 gap-4">
                  <div><label className={LABEL}>Dental Limit (RM/yr) — set 0 to hide</label><input type="number" className={INPUT} value={termsForm.dental_limit} onChange={e => setTerms("dental_limit", Number(e.target.value))} /></div>
                  <div><label className={LABEL}>Newborn Allowance (RM) — set 0 to hide</label><input type="number" className={INPUT} value={termsForm.newborn_allowance} onChange={e => setTerms("newborn_allowance", Number(e.target.value))} /></div>
                  <div><label className={LABEL}>Max Births Covered</label><input type="number" className={INPUT} value={termsForm.newborn_max} onChange={e => setTerms("newborn_max", Number(e.target.value))} /></div>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Travel / Mileage Claim Rate</p>
                <div className="grid grid-cols-3 gap-4">
                  <div><label className={LABEL}>Tier 1 Distance (km)</label><input type="number" className={INPUT} value={termsForm.travel_tier1_km} onChange={e => setTerms("travel_tier1_km", Number(e.target.value))} /></div>
                  <div><label className={LABEL}>Tier 1 Rate (RM/km)</label><input type="number" step="0.01" className={INPUT} value={termsForm.travel_tier1_rate} onChange={e => setTerms("travel_tier1_rate", Number(e.target.value))} /></div>
                  <div><label className={LABEL}>Tier 2 Rate (RM/km)</label><input type="number" step="0.01" className={INPUT} value={termsForm.travel_tier2_rate} onChange={e => setTerms("travel_tier2_rate", Number(e.target.value))} /></div>
                </div>
                <p className="text-xs text-gray-400 mt-1">e.g. First 100 km at RM0.70/km, remaining at RM0.50/km</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LEAVE TAB */}
      {tab === "leave" && <LeaveBalancesTab empId={Number(id)} emp={emp} leaveBalances={leaveBalances} refetchLeave={() => qc.invalidateQueries({ queryKey: ["hr-leave-balances", id] })} />}

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

    </div>
  );
}
