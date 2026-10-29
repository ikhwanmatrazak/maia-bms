"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Card, CardBody, Tabs, Tab } from "@heroui/react";
import { accountingApi } from "@/lib/api";
import { Topbar } from "@/components/ui/Topbar";
import { formatCurrency } from "@/lib/utils";
import {
  BookOpen, RefreshCw, TrendingUp, TrendingDown, DollarSign,
  FileText, BarChart2, Scale, List,
} from "lucide-react";
import AccountsTab from "./AccountsTab";
import EntriesTab from "./EntriesTab";
import ReportsTab from "./ReportsTab";

function StatCard({
  label, value, icon: Icon, color,
}: {
  label: string; value: string; icon: any; color: string;
}) {
  return (
    <Card className="flex-1">
      <CardBody className="flex flex-row items-center gap-4 p-4">
        <div className={`p-2.5 rounded-xl ${color}`}>
          <Icon size={20} className="text-white" />
        </div>
        <div>
          <div className="text-xs text-default-400 mb-0.5">{label}</div>
          <div className="text-lg font-bold">{value}</div>
        </div>
      </CardBody>
    </Card>
  );
}

export default function AccountingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("reports");

  const { data: summary, isLoading } = useQuery({
    queryKey: ["accounting-summary"],
    queryFn: () => accountingApi.summary(),
  });

  const syncMutation = useMutation({
    mutationFn: () => accountingApi.sync(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["accounting-summary"] });
      queryClient.invalidateQueries({ queryKey: ["accounting-entries"] });
      alert(`Sync complete — ${data.synced} new entries added.`);
    },
  });

  const year = new Date().getFullYear();

  return (
    <div className="flex flex-col min-h-screen bg-default-50">
      <Topbar title="Bookkeeping" />
      <div className="p-4 md:p-6 max-w-6xl mx-auto w-full flex flex-col gap-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xl font-bold">Bookkeeping</div>
            <div className="text-sm text-default-400">Financial records for {year}</div>
          </div>
          <Button
            color="primary"
            variant="flat"
            startContent={<RefreshCw size={14} />}
            isLoading={syncMutation.isPending}
            onPress={() => syncMutation.mutate()}
          >
            Sync from Invoices &amp; Vouchers
          </Button>
        </div>

        {/* Summary cards */}
        <div className="flex gap-3 flex-wrap">
          <StatCard
            label={`Revenue (${year})`}
            value={formatCurrency(summary?.total_revenue ?? 0, "MYR")}
            icon={TrendingUp}
            color="bg-success-500"
          />
          <StatCard
            label={`Expenses (${year})`}
            value={formatCurrency(summary?.total_expenses ?? 0, "MYR")}
            icon={TrendingDown}
            color="bg-danger-500"
          />
          <StatCard
            label={`Net Profit (${year})`}
            value={formatCurrency(summary?.net_profit ?? 0, "MYR")}
            icon={DollarSign}
            color={(summary?.net_profit ?? 0) >= 0 ? "bg-primary-500" : "bg-warning-500"}
          />
          <StatCard
            label="Journal Entries"
            value={String(summary?.entry_count ?? 0)}
            icon={BookOpen}
            color="bg-secondary-500"
          />
        </div>

        {/* Tabs */}
        <Tabs
          selectedKey={tab}
          onSelectionChange={(k) => setTab(k as string)}
          variant="underlined"
          color="primary"
        >
          <Tab key="reports" title={<span className="flex items-center gap-1.5"><BarChart2 size={14} />Reports</span>}>
            <ReportsTab />
          </Tab>
          <Tab key="entries" title={<span className="flex items-center gap-1.5"><FileText size={14} />Journal Entries</span>}>
            <EntriesTab />
          </Tab>
          <Tab key="accounts" title={<span className="flex items-center gap-1.5"><List size={14} />Chart of Accounts</span>}>
            <AccountsTab />
          </Tab>
        </Tabs>

      </div>
    </div>
  );
}
