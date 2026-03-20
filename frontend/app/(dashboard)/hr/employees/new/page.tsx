"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { hrApi } from "@/lib/api";
import { ChevronLeft } from "lucide-react";

const SECTION = "px-6 py-5 space-y-4";
const LABEL = "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1";
const INPUT = "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20";
const SELECT = "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none bg-white";

export default function NewEmployeePage() {
  const router = useRouter();
  const qc = useQueryClient();

  const { data: departments = [] } = useQuery({
    queryKey: ["hr-departments"],
    queryFn: hrApi.listDepartments,
  });

  const [form, setForm] = useState({
    employee_no: "", full_name: "", department_id: "",
    designation: "", employment_type: "full_time", employment_status: "probation",
    join_date: "", confirmation_date: "",
    email: "", phone: "",
    ic_no: "", passport_no: "", date_of_birth: "", gender: "",
    nationality: "Malaysian", religion: "", marital_status: "",
    address: "",
    emergency_contact_name: "", emergency_contact_phone: "", emergency_contact_relation: "",
    basic_salary: "", bank_name: "", bank_account_no: "",
    epf_no: "", socso_no: "", income_tax_no: "",
    children_count: "0", spouse_working: false,
  });

  const set = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  const mutation = useMutation({
    mutationFn: (data: object) => hrApi.createEmployee(data),
    onSuccess: (emp: any) => {
      qc.invalidateQueries({ queryKey: ["hr-employees"] });
      router.push(`/hr/employees/${emp.id}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: any = { ...form };
    if (data.department_id) data.department_id = Number(data.department_id);
    else delete data.department_id;
    if (data.basic_salary) data.basic_salary = Number(data.basic_salary);
    else delete data.basic_salary;
    if (data.children_count) data.children_count = Number(data.children_count);
    ["join_date", "confirmation_date", "date_of_birth"].forEach((k) => {
      if (!data[k]) delete data[k];
    });
    mutation.mutate(data);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Add New Employee</h1>
          <p className="text-sm text-gray-400">Fill in the employee details below</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Employment Info */}
        <div className="bg-white rounded-xl border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-gray-700">Employment Information</h2>
          </div>
          <div className={SECTION}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Employee No. *</label>
                <input required className={INPUT} value={form.employee_no} onChange={e => set("employee_no", e.target.value)} placeholder="e.g. EMP-001" />
              </div>
              <div>
                <label className={LABEL}>Full Name *</label>
                <input required className={INPUT} value={form.full_name} onChange={e => set("full_name", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Department</label>
                <select className={SELECT} value={form.department_id} onChange={e => set("department_id", e.target.value)}>
                  <option value="">Select department</option>
                  {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL}>Designation / Job Title</label>
                <input className={INPUT} value={form.designation} onChange={e => set("designation", e.target.value)} placeholder="e.g. Software Engineer" />
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
              <div>
                <label className={LABEL}>Join Date</label>
                <input type="date" className={INPUT} value={form.join_date} onChange={e => set("join_date", e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Confirmation Date</label>
                <input type="date" className={INPUT} value={form.confirmation_date} onChange={e => set("confirmation_date", e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        {/* Personal Info */}
        <div className="bg-white rounded-xl border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-gray-700">Personal Information</h2>
          </div>
          <div className={SECTION}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Email</label>
                <input type="email" className={INPUT} value={form.email} onChange={e => set("email", e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Phone</label>
                <input className={INPUT} value={form.phone} onChange={e => set("phone", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>IC No.</label>
                <input className={INPUT} value={form.ic_no} onChange={e => set("ic_no", e.target.value)} placeholder="e.g. 900101-07-1234" />
              </div>
              <div>
                <label className={LABEL}>Date of Birth</label>
                <input type="date" className={INPUT} value={form.date_of_birth} onChange={e => set("date_of_birth", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Gender</label>
                <select className={SELECT} value={form.gender} onChange={e => set("gender", e.target.value)}>
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
              <div>
                <label className={LABEL}>Marital Status</label>
                <select className={SELECT} value={form.marital_status} onChange={e => set("marital_status", e.target.value)}>
                  <option value="">Select</option>
                  <option value="single">Single</option>
                  <option value="married">Married</option>
                  <option value="divorced">Divorced</option>
                  <option value="widowed">Widowed</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Nationality</label>
                <input className={INPUT} value={form.nationality} onChange={e => set("nationality", e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Religion</label>
                <input className={INPUT} value={form.religion} onChange={e => set("religion", e.target.value)} />
              </div>
            </div>
            <div>
              <label className={LABEL}>Address</label>
              <textarea rows={2} className={INPUT} value={form.address} onChange={e => set("address", e.target.value)} />
            </div>
          </div>
        </div>

        {/* Emergency Contact */}
        <div className="bg-white rounded-xl border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-gray-700">Emergency Contact</h2>
          </div>
          <div className={SECTION}>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={LABEL}>Name</label>
                <input className={INPUT} value={form.emergency_contact_name} onChange={e => set("emergency_contact_name", e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Phone</label>
                <input className={INPUT} value={form.emergency_contact_phone} onChange={e => set("emergency_contact_phone", e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Relationship</label>
                <input className={INPUT} value={form.emergency_contact_relation} onChange={e => set("emergency_contact_relation", e.target.value)} placeholder="e.g. Spouse" />
              </div>
            </div>
          </div>
        </div>

        {/* Payroll */}
        <div className="bg-white rounded-xl border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-gray-700">Payroll Information</h2>
          </div>
          <div className={SECTION}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Basic Salary (MYR)</label>
                <input type="number" step="0.01" className={INPUT} value={form.basic_salary} onChange={e => set("basic_salary", e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <label className={LABEL}>Bank Name</label>
                <input className={INPUT} value={form.bank_name} onChange={e => set("bank_name", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Bank Account No.</label>
                <input className={INPUT} value={form.bank_account_no} onChange={e => set("bank_account_no", e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>EPF No.</label>
                <input className={INPUT} value={form.epf_no} onChange={e => set("epf_no", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>SOCSO No.</label>
                <input className={INPUT} value={form.socso_no} onChange={e => set("socso_no", e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Income Tax No. (PCB)</label>
                <input className={INPUT} value={form.income_tax_no} onChange={e => set("income_tax_no", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>No. of Children</label>
                <input type="number" min="0" className={INPUT} value={form.children_count} onChange={e => set("children_count", e.target.value)} />
              </div>
              <div className="flex items-center gap-3 pt-5">
                <input type="checkbox" id="spouse_working" checked={form.spouse_working as boolean} onChange={e => set("spouse_working", e.target.checked)} className="w-4 h-4" />
                <label htmlFor="spouse_working" className="text-sm text-gray-700">Spouse is working</label>
              </div>
            </div>
          </div>
        </div>

        {mutation.isError && (
          <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-100">
            Failed to create employee. Please check the form and try again.
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button type="button" onClick={() => router.back()} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="px-6 py-2 text-sm font-medium bg-[#1a1a2e] text-white rounded-lg hover:bg-[#2a2a3e] disabled:opacity-50"
          >
            {mutation.isPending ? "Saving..." : "Create Employee"}
          </button>
        </div>
      </form>
    </div>
  );
}
