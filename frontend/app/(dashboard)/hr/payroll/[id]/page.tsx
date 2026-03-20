"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { hrApi } from "@/lib/api";
import { ChevronLeft, Lock } from "lucide-react";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmt = (v: number | undefined | null) => `MYR ${(v || 0).toLocaleString("en-MY", { minimumFractionDigits: 2 })}`;

export default function PayrollRunDetailPage() {
  const { id } = useParams();
  const router = useRouter();

  const { data: run, isLoading } = useQuery({
    queryKey: ["hr-payroll-run", id],
    queryFn: () => hrApi.getPayrollRun(Number(id)),
  });

  if (isLoading || !run) return <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Loading...</div>;

  const lines = run.payslip_lines || [];

  return (
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
          <h2 className="text-sm font-semibold text-gray-700">Payslips ({lines.length})</h2>
        </div>
        <table className="w-full text-sm min-w-[900px]">
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
            </tr>
          </thead>
          <tbody>
            {lines.map((l: any) => {
              const allowances = (l.transport_allowance || 0) + (l.housing_allowance || 0) + (l.phone_allowance || 0) + (l.other_allowance || 0);
              const otClaims = (l.overtime_pay || 0) + (l.claims_reimbursement || 0);
              return (
                <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50">
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
                </tr>
              );
            })}
          </tbody>
          {lines.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50">
                <td className="px-4 py-3 font-semibold" colSpan={4}>Total</td>
                <td className="px-4 py-3 text-right font-bold border-l border-gray-100">{fmt(run.total_gross)}</td>
                <td className="px-4 py-3 text-right font-semibold text-orange-600">{fmt(lines.reduce((s: number, l: any) => s + (l.epf_employee || 0), 0))}</td>
                <td className="px-4 py-3 text-right font-semibold text-orange-600">{fmt(lines.reduce((s: number, l: any) => s + (l.socso_employee || 0), 0))}</td>
                <td className="px-4 py-3 text-right font-semibold text-orange-600">{fmt(lines.reduce((s: number, l: any) => s + (l.eis_employee || 0), 0))}</td>
                <td className="px-4 py-3 text-right font-semibold text-orange-600">{fmt(lines.reduce((s: number, l: any) => s + (l.pcb || 0), 0))}</td>
                <td className="px-4 py-3 text-right font-bold text-green-700 border-l border-gray-100">{fmt(run.total_net)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Employer Contributions */}
      {lines.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Employer Contributions (Cost to Company)</h2>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-500">EPF (Employer)</p>
              <p className="font-semibold mt-1">{fmt(lines.reduce((s: number, l: any) => s + (l.epf_employer || 0), 0))}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">SOCSO (Employer)</p>
              <p className="font-semibold mt-1">{fmt(lines.reduce((s: number, l: any) => s + (l.socso_employer || 0), 0))}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">EIS (Employer)</p>
              <p className="font-semibold mt-1">{fmt(lines.reduce((s: number, l: any) => s + (l.eis_employer || 0), 0))}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
