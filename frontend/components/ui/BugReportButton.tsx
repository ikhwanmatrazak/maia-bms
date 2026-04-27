"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Bug, X, ChevronDown } from "lucide-react";
import { bugReportsApi } from "@/lib/api";

const SEVERITIES = [
  { key: "low", label: "Low", color: "text-gray-500" },
  { key: "medium", label: "Medium", color: "text-yellow-600" },
  { key: "high", label: "High", color: "text-orange-600" },
  { key: "critical", label: "Critical", color: "text-red-600" },
];

export function BugReportButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", steps: "", severity: "medium" });
  const [done, setDone] = useState(false);

  const mutation = useMutation({
    mutationFn: () => bugReportsApi.create({
      title: form.title,
      description: form.description,
      steps: form.steps || undefined,
      page_url: pathname,
      severity: form.severity,
    }),
    onSuccess: () => {
      setDone(true);
      setTimeout(() => {
        setOpen(false);
        setDone(false);
        setForm({ title: "", description: "", steps: "", severity: "medium" });
      }, 2000);
    },
  });

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2.5 rounded-full shadow-lg transition-all hover:shadow-xl"
        title="Report a bug"
      >
        <Bug size={16} />
        <span>Report Bug</span>
      </button>

      {/* Modal overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Bug size={18} className="text-red-500" />
                <h2 className="font-semibold text-gray-900">Report a Bug</h2>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {done ? (
              <div className="p-8 text-center">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="font-medium text-gray-900">Bug reported!</p>
                <p className="text-sm text-gray-500 mt-1">We'll look into it. Thank you.</p>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                {/* Page URL (auto) */}
                <div className="bg-gray-50 rounded-lg px-3 py-2 flex items-center gap-2">
                  <span className="text-xs text-gray-400">Page:</span>
                  <span className="text-xs text-gray-600 font-mono truncate">{pathname}</span>
                </div>

                {/* Title */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                    What went wrong? *
                  </label>
                  <input
                    autoFocus
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20"
                    placeholder="Short summary of the bug"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                    Describe the bug *
                  </label>
                  <textarea
                    rows={3}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 resize-none"
                    placeholder="What happened? What did you expect?"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </div>

                {/* Steps */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                    Steps to reproduce (optional)
                  </label>
                  <textarea
                    rows={2}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 resize-none"
                    placeholder="1. Click on... 2. Then..."
                    value={form.steps}
                    onChange={(e) => setForm((f) => ({ ...f, steps: e.target.value }))}
                  />
                </div>

                {/* Severity */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Severity</label>
                  <div className="flex gap-2">
                    {SEVERITIES.map((s) => (
                      <button
                        key={s.key}
                        onClick={() => setForm((f) => ({ ...f, severity: s.key }))}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                          form.severity === s.key
                            ? "border-red-500 bg-red-50 text-red-700"
                            : "border-gray-200 text-gray-500 hover:border-gray-300"
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {mutation.isError && (
                  <p className="text-xs text-red-500">Failed to submit. Please try again.</p>
                )}

                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => setOpen(false)}
                    className="flex-1 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={!form.title || !form.description || mutation.isPending}
                    onClick={() => mutation.mutate()}
                    className="flex-1 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    {mutation.isPending ? "Submitting..." : "Submit Bug"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
