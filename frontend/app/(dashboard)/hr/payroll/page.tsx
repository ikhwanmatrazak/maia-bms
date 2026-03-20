"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hrApi } from "@/lib/api";
import Link from "next/link";
import { Plus, Lock, Trash2 } from "lucide-react";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const now = new Date();

export default function PayrollPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ month: now.getMonth() + 1, year: now.getFullYear(), notes: "" });

  const { data: runs = [], isLoading } = useQuery({
    queryKey: ["hr-payroll"],
    queryFn: hrApi.listPayroll,
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => hrApi.createPayrollRun(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr-payroll"] }); setShowModal(false); },
  });

  const finalizeMutation = useMutation({
    mutationFn: (id: number) => hrApi.finalizePayroll(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr-payroll"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => hrApi.deletePayrollRun(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr-payroll"] }),
  });

  const fmt = (v: number) => `MYR ${v.toLocaleString("en-MY", { minimumFractionDigits: 2 })}`;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payroll</h1>
          <p className="text-sm text-gray-500">Monthly payroll with EPF, SOCSO, EIS & PCB</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-[#1a1a2e] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#2a2a3e]">
          <Plus size={16} /> New Payroll Run
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="py-10 text-center text-sm text-gray-400">Loading...</div>
        ) : runs.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-gray-400 text-sm">No payroll runs yet</p>
            <button onClick={() => setShowModal(true)} className="mt-3 text-sm text-blue-600 hover:underline">Run first payroll</button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Period</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 hidden md:table-cell">Employees</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Gross Pay</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Net Pay</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r: any) => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{MONTHS[r.month - 1]} {r.year}</td>
                  <td className="px-4 py-3 text-right text-gray-600 hidden md:table-cell">{r.total_employee_count}</td>
                  <td className="px-4 py-3 text-right font-semibold">{fmt(r.total_gross || 0)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-green-700">{fmt(r.total_net || 0)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.status === "finalized" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Link href={`/hr/payroll/${r.id}`} className="text-blue-500 hover:text-blue-700 text-xs font-medium">View</Link>
                      {r.status !== "finalized" && (
                        <>
                          <button onClick={() => finalizeMutation.mutate(r.id)} className="text-green-600 hover:text-green-800 p-1" title="Finalize"><Lock size={13} /></button>
                          <button onClick={() => { if (confirm("Delete this payroll run?")) deleteMutation.mutate(r.id); }} className="text-red-400 hover:text-red-600 p-1" title="Delete"><Trash2 size={13} /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-bold">New Payroll Run</h2>
            <p className="text-sm text-gray-500">This will calculate salaries for all active employees for the selected month, including EPF, SOCSO, EIS, and PCB deductions.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Month</label>
                <select className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={form.month} onChange={e => setForm(prev => ({ ...prev, month: Number(e.target.value) }))}>
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Year</label>
                <input type="number" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={form.year} onChange={e => setForm(prev => ({ ...prev, year: Number(e.target.value) }))} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Notes (optional)</label>
              <textarea rows={2} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={form.notes} onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))} />
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg">Cancel</button>
              <button disabled={createMutation.isPending} onClick={() => createMutation.mutate(form)} className="px-4 py-2 text-sm font-medium bg-[#1a1a2e] text-white rounded-lg disabled:opacity-40">
                {createMutation.isPending ? "Processing..." : "Run Payroll"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
