"use client";

import { useQuery } from "@tanstack/react-query";
import { remindersApi } from "@/lib/api";

export function Topbar({ title }: { title?: string }) {
  // shared cache key — all pages reuse this result, no duplicate API calls
  const { data: reminders = [] } = useQuery({
    queryKey: ["reminders", "overdue"],
    queryFn: () => remindersApi.list({ filter: "overdue" }),
    refetchInterval: 5 * 60 * 1000, // poll every 5 min instead of every 60s
  });

  const overdueCount = reminders.length;

  return (
    <header className="h-14 bg-white border-b border-divider flex items-center justify-between px-6">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {overdueCount > 0 && (
        <div className="flex items-center gap-1.5 text-sm text-danger">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4">
            <path fillRule="evenodd" d="M10 2a6 6 0 0 0-6 6c0 1.887-.454 3.665-1.257 5.234a.75.75 0 0 0 .515 1.076 32.91 32.91 0 0 0 3.256.508 3.5 3.5 0 0 0 6.972 0 32.903 32.903 0 0 0 3.256-.508.75.75 0 0 0 .515-1.076A11.448 11.448 0 0 1 16 8a6 6 0 0 0-6-6ZM8.05 14.943a33.54 33.54 0 0 0 3.9 0 2 2 0 0 1-3.9 0Z" clipRule="evenodd" />
          </svg>
          <span>{overdueCount} overdue reminder{overdueCount > 1 ? "s" : ""}</span>
        </div>
      )}
    </header>
  );
}
