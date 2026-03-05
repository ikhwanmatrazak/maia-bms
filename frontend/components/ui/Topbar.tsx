"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge, Chip } from "@heroui/react";
import { remindersApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";

export function Topbar({ title }: { title?: string }) {
  const { data: reminders = [] } = useQuery({
    queryKey: ["reminders", "overdue"],
    queryFn: () => remindersApi.list({ filter: "overdue" }),
    refetchInterval: 60 * 1000,
  });

  const overdueCount = reminders.length;

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
      <div className="flex items-center gap-4">
        {overdueCount > 0 && (
          <div className="flex items-center gap-2 text-sm text-danger">
            <span>🔔</span>
            <span>{overdueCount} overdue reminder{overdueCount > 1 ? "s" : ""}</span>
          </div>
        )}
      </div>
    </header>
  );
}
