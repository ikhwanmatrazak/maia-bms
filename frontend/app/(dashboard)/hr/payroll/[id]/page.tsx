"use client";

import { Topbar } from "@/components/ui/Topbar";
import { useParams, useRouter } from "next/navigation";
import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { hrApi, downloadPdf } from "@/lib/api";
import { ChevronLeft, Download, Pencil, Check, X } from "lucide-react";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmt = (v: number | undefined | null) => `MYR ${(v || 0).toLocaleString("en-MY", { minimumFractionDigits: 2 })}`;
const n = (v: any) => Number(v) || 0;

type EditForm = {
  transport_allowance: string;
  housing_allowance: string;
  phone_allowance: string;
  other_allowance: string;
  overtime_pay: string;
  claims_reimbursement: string;
};

function PayslipRow({
  l, runId, isDraft, dlLoading,
  onSaved, onDownload,
}: {
  l: any; runId: number; isDraft: boolean; dlLoading: number | null;
  onSaved: (id: number, updated: any) => void;
  onDownload: (id: number, name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EditForm>({
    transport_allowance: "0",
    housing_allowance: "0",
    phone_allowance: "0",
    other_allowance: "0",
    overtime_pay: "0",
    claims_reimbursement: "0",
  });

  const startEdit = () => {
    setForm({
      transport_allowance: String(l.transport_allowance || 0),
      housing_allowance: String(l.housing_allowance || 0),
      phone_allowance: String(l.phone_allowance || 0),
      other_allowance: String(l.other_allowance || 0),
      overtime_pay: String(l.overtime_pay || 0),
      claims_reimbursement: String(l.claims_reimbursement || 0),
    });
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const updated = await hrApi.updatePayslipLine(runId, l.id, {
        transport_allowance: parseFloat(form.transport_allowance) || 0,
        housing_allowance: parseFloat(form.housing_allowance) || 0,
        phone_allowance: parseFloat(form.phone_allowance) || 0,
        other_allowance: parseFloat(form.other_allowance) || 0,
        overtime_pay: parseFloat(form.overtime_pay) || 0,
        claims_reimbursement: parseFloat(form.claims_reimbursement) || 0,
      });
      onSaved(l.id, updated);
      setEditing(false);
    } catch {
      alert("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const allowances = n(l.transport_allowance) + n(l.housing_allowance) + n(l.phone_allowance) + n(l.other_allowance);
  const otClaims = n(l.overtime_pay) + n(l.claims_reimbursement);
  const inp = "w-20 text-right border border-blue-300 rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400";
  const set = (k: keyof EditForm, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <>
      <tr className={`border-b border-gray-50 ${editing ? "hidden" : "hover:bg-gray-50"}`}>
        <td className="px-4 py-3">
          <p className="font-medium">{l.employee_name}</p>
          <p className="text-xs text-gray-400">{l.employee_no}</p>
        </td>
        <td className="px-4 py-3 text-right">{fmt(l.basic_salary)}</td>
        <td className="px-4 py-3 text-right">{allowances > 0 ? fmt(allowances) : "—"}</td>
        <td className="px-4 py-3 text-right">{otClaims > 0 ? fmt(otClaims) : "—"}</td>
        <td className="px-4 py-3 text-right font-semibold border-l border-gray-100">{fmt(l.gross_pay)}</td>
        <td className="px-4 py-3 text-right text-orange-600">{fmt(l.epf_employee)}</td>
        <td className="px-4 py-3 text-right text-orange-600">{fmt(l.socso_employee)}</td>
        <td className="px-4 py-3 text-right text-orange-600">{fmt(l.eis_employee)}</td>
        <td className="px-4 py-3 text-right text-orange-600">{fmt(l.pcb)}</td>
        <td className="px-4 py-3 text-right font-bold text-green-700 border-l border-gray-100">{fmt(l.net_pay)}</td>
        <td className="px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-0.5">
            {isDraft && (
              <button onClick={startEdit} title="Edit allowances" className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600">
                <Pencil size={13} />
              </button>
            )}
            <button
              onClick={() => onDownload(l.id, l.employee_name || "employee")}
              disabled={dlLoading === l.id}
              title="Download Payslip PDF"
              className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 disabled:opacity-40"
            >
              <Download size={13} />
            </button>
          </div>
        </td>
      </tr>

      {editing && (
        <tr className="border-b border-blue-100 bg-blue-50">
          <td className="px-4 py-3" colSpan={11}>
            <p className="text-xs font-semibold text-gray-700 mb-2">{l.employee_name} — Edit Allowances (RM)</p>
            <div className="flex items-center gap-4 flex-wrap text-xs">
              <label className="flex items-center gap-1.5 text-gray-500">Transport <input className={inp} value={form.transport_allowance} onChange={e => set("transport_allowance", e.target.value)} /></label>
              <label className="flex items-center gap-1.5 text-gray-500">Housing <input className={inp} value={form.housing_allowance} onChange={e => set("housing_allowance", e.target.value)} /></label>
              <label className="flex items-center gap-1.5 text-gray-500">Phone <input className={inp} value={form.phone_allowance} onChange={e => set("phone_allowance", e.target.value)} /></label>
              <label className="flex items-center gap-1.5 text-gray-500">Other <input className={inp} value={form.other_allowance} onChange={e => set("other_allowance", e.target.value)} /></label>
              <label className="flex items-center gap-1.5 text-gray-500">Overtime <input className={inp} value={form.overtime_pay} onChange={e => set("overtime_pay", e.target.value)} /></label>
              <label className="flex items-center gap-1.5 text-gray-500">Claims <input className={inp} value={form.claims_reimbursement} onChange={e => set("claims_reimbursement", e.target.value)} /></label>
              <button onClick={save} disabled={saving} className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50">
                <Check size={11} />{saving ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setEditing(false)} className="flex items-center gap-1 px-2.5 py-1 border border-gray-300 rounded text-xs text-gray-600 hover:bg-gray-100">
                <X size={11} />Cancel
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function PayrollRunDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: run, isLoading } = useQuery({
    queryKey: ["hr-payroll-run", id],
    queryFn: () => hrApi.getPayrollRun(Number(id)),
  });

  const [dlLoading, setDlLoading] = useState<number | null>(null);
  const [localLines, setLocalLines] = useState<any[] | null>(null);

  const currentLines: any[] = localLines ?? (run?.payslip_lines || []);

  const handleSaved = useCallback((lineId: number, updated: any) => {
    setLocalLines(prev => {
      const base = prev ?? (run?.payslip_lines || []);
      return base.map((l: any) => l.id === lineId ? { ...l, ...updated } : l);
    });
    qc.invalidateQueries({ queryKey: ["hr-payroll-run", id] });
  }, [run, id, qc]);

  const handleDownload = async (lineId: number, employeeName: string) => {
    setDlLoading(lineId);
    try {
      const url = hrApi.payslipPdfUrl(Number(id), lineId);
      await downloadPdf(url, `Payslip_${employeeName.replace(/\s+/g, "_")}_${MONTHS[(run?.month || 1) - 1]}_${run?.year}.pdf`);
    } catch {
      alert("Failed to download payslip.");
    } finally {
      setDlLoading(null);
    }
  };

  if (isLoading || !run) return <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Loading…</div>;

  const isDraft = run.status === "draft";

  return (
    <div>
      <Topbar title="Payroll Details" />
      <div className="p-6 space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600"><ChevronLeft size={20} /></button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Payroll — {MONTHS[run.month - 1]} {run.year}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${run.status === "finalized" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                {run.status}
              </span>
              {run.status === "finalized" && run.finalized_at && (
                <span className="text-xs text-gray-400">Finalized {new Date(run.finalized_at).toLocaleDateString()}</span>
              )}
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-500">Employees</p>
            <p className="text-2xl font-bold mt-1">{run.total_employee_count}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-500">Total Gross</p>
            <p className="text-xl font-bold mt-1">{fmt(run.total_gross)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-500">Total Net</p>
            <p className="text-xl font-bold mt-1 text-green-700">{fmt(run.total_net)}</p>
          </div>
        </div>

        {/* Payslip Lines Table */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          <div className="px-5 py-4 border-b border-gray-50 flex justify-between items-center">
            <h2 className="text-sm font-semibold text-gray-700">Payslips ({currentLines.length})</h2>
            {isDraft && <p className="text-xs text-gray-400 flex items-center gap-1"><Pencil size={11} /> to edit allowances per employee</p>}
          </div>
          <table className="w-full text-sm min-w-[960px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Employee</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Basic</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Allowances</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">OT/Claims</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 border-l border-gray-100">Gross</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">EPF (Emp)</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">SOCSO</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">EIS</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">PCB</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 border-l border-gray-100">Net Pay</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 w-24 text-center"></th>
              </tr>
            </thead>
            <tbody>
              {currentLines.map((l: any) => (
                <PayslipRow
                  key={l.id}
                  l={l}
                  runId={Number(id)}
                  isDraft={isDraft}
                  dlLoading={dlLoading}
                  onSaved={handleSaved}
                  onDownload={handleDownload}
                />
              ))}
            </tbody>
            {currentLines.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td className="px-4 py-3 font-semibold" colSpan={4}>Total</td>
                  <td className="px-4 py-3 text-right font-bold border-l border-gray-100">{fmt(currentLines.reduce((s: number, l: any) => s + n(l.gross_pay), 0))}</td>
                  <td className="px-4 py-3 text-right font-semibold text-orange-600">{fmt(currentLines.reduce((s: number, l: any) => s + n(l.epf_employee), 0))}</td>
                  <td className="px-4 py-3 text-right font-semibold text-orange-600">{fmt(currentLines.reduce((s: number, l: any) => s + n(l.socso_employee), 0))}</td>
                  <td className="px-4 py-3 text-right font-semibold text-orange-600">{fmt(currentLines.reduce((s: number, l: any) => s + n(l.eis_employee), 0))}</td>
                  <td className="px-4 py-3 text-right font-semibold text-orange-600">{fmt(currentLines.reduce((s: number, l: any) => s + n(l.pcb), 0))}</td>
                  <td className="px-4 py-3 text-right font-bold text-green-700 border-l border-gray-100">{fmt(currentLines.reduce((s: number, l: any) => s + n(l.net_pay), 0))}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Employer Contributions */}
        {currentLines.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Employer Contributions (Cost to Company)</h2>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-500">EPF (Employer)</p>
                <p className="font-semibold mt-1">{fmt(currentLines.reduce((s: number, l: any) => s + n(l.epf_employer), 0))}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">SOCSO (Employer)</p>
                <p className="font-semibold mt-1">{fmt(currentLines.reduce((s: number, l: any) => s + n(l.socso_employer), 0))}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">EIS (Employer)</p>
                <p className="font-semibold mt-1">{fmt(currentLines.reduce((s: number, l: any) => s + n(l.eis_employer), 0))}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
