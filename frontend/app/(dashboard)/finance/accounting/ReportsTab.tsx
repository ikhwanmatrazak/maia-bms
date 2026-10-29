"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Card, CardBody, Select, SelectItem, Tabs, Tab } from "@heroui/react";
import { accountingApi } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function SectionRow({ label, amount, bold }: { label: string; amount: number; bold?: boolean }) {
  const cls = bold ? "font-bold text-sm" : "text-sm";
  const amtCls = amount < 0
    ? "text-danger font-medium"
    : bold ? "font-bold" : "";
  return (
    <div className={`flex justify-between py-1.5 border-b border-default-50 last:border-0 ${cls}`}>
      <span>{label}</span>
      <span className={amtCls}>{formatCurrency(Math.abs(amount), "MYR")}{amount < 0 ? " (Loss)" : ""}</span>
    </div>
  );
}

function PLReport() {
  const year = new Date().getFullYear();
  const [start, setStart] = useState(`${year}-01-01`);
  const [end, setEnd] = useState(`${year}-12-31`);
  const [fetch, setFetch] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["acc-pl", start, end],
    queryFn: () => accountingApi.pl(start, end),
    enabled: fetch,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3 items-end flex-wrap">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-default-400">From</label>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
            className="border border-default-200 rounded-lg px-3 py-1.5 text-sm bg-default-50" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-default-400">To</label>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
            className="border border-default-200 rounded-lg px-3 py-1.5 text-sm bg-default-50" />
        </div>
        <Button color="primary" size="sm" isLoading={isLoading} onPress={() => setFetch(true)}>
          Generate
        </Button>
      </div>
      {data && (
        <Card>
          <CardBody className="flex flex-col gap-1">
            <div className="text-xs font-bold text-default-400 uppercase tracking-wide mb-2">Revenue</div>
            {data.revenue.map((r: any) => <SectionRow key={r.code} label={`${r.code} ${r.name}`} amount={r.amount} />)}
            <SectionRow label="Total Revenue" amount={data.total_revenue} bold />
            <div className="mt-3 text-xs font-bold text-default-400 uppercase tracking-wide mb-2">Expenses</div>
            {data.expenses.map((r: any) => <SectionRow key={r.code} label={`${r.code} ${r.name}`} amount={r.amount} />)}
            <SectionRow label="Total Expenses" amount={data.total_expenses} bold />
            <div className="mt-3 border-t-2 border-default-200 pt-3">
              <SectionRow label="Net Profit / (Loss)" amount={data.net_profit} bold />
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function BalanceSheetReport() {
  const today = new Date().toISOString().split("T")[0];
  const [asOf, setAsOf] = useState(today);
  const [fetch, setFetch] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["acc-bs", asOf],
    queryFn: () => accountingApi.balanceSheet(asOf),
    enabled: fetch,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-default-400">As of Date</label>
          <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)}
            className="border border-default-200 rounded-lg px-3 py-1.5 text-sm bg-default-50" />
        </div>
        <Button color="primary" size="sm" isLoading={isLoading} onPress={() => setFetch(true)}>Generate</Button>
      </div>
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardBody>
              <div className="text-xs font-bold text-default-400 uppercase tracking-wide mb-2">Assets</div>
              {data.assets.map((r: any) => <SectionRow key={r.code} label={`${r.code} ${r.name}`} amount={r.amount} />)}
              <SectionRow label="Total Assets" amount={data.total_assets} bold />
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <div className="text-xs font-bold text-default-400 uppercase tracking-wide mb-2">Liabilities</div>
              {data.liabilities.map((r: any) => <SectionRow key={r.code} label={`${r.code} ${r.name}`} amount={r.amount} />)}
              <SectionRow label="Total Liabilities" amount={data.total_liabilities} bold />
              <div className="mt-4 text-xs font-bold text-default-400 uppercase tracking-wide mb-2">Equity</div>
              {data.equity.map((r: any) => <SectionRow key={r.code} label={`${r.code} ${r.name}`} amount={r.amount} />)}
              <SectionRow label="Total Equity" amount={data.total_equity} bold />
              <div className="mt-3 border-t-2 border-default-200 pt-2">
                <SectionRow label="Liabilities + Equity" amount={data.total_liabilities + data.total_equity} bold />
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}

function CashFlowReport() {
  const year = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(String(year));
  const [fetch, setFetch] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["acc-cf", selectedYear],
    queryFn: () => accountingApi.cashFlow(Number(selectedYear)),
    enabled: fetch,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-default-400">Year</label>
          <input type="number" value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)}
            className="border border-default-200 rounded-lg px-3 py-1.5 text-sm bg-default-50 w-28" />
        </div>
        <Button color="primary" size="sm" isLoading={isLoading} onPress={() => setFetch(true)}>Generate</Button>
      </div>
      {data && (
        <Card>
          <CardBody>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-default-100">
                  <th className="text-left py-2 text-default-400 font-medium">Month</th>
                  <th className="text-right py-2 text-default-400 font-medium">Cash In (MYR)</th>
                  <th className="text-right py-2 text-default-400 font-medium">Cash Out (MYR)</th>
                  <th className="text-right py-2 text-default-400 font-medium">Net (MYR)</th>
                </tr>
              </thead>
              <tbody>
                {data.months.map((m: any) => (
                  <tr key={m.month} className="border-b border-default-50">
                    <td className="py-2">{MONTHS[m.month - 1]}</td>
                    <td className="text-right py-2 text-success-600">{m.cash_in.toFixed(2)}</td>
                    <td className="text-right py-2 text-danger-600">{m.cash_out.toFixed(2)}</td>
                    <td className={`text-right py-2 font-medium ${m.net >= 0 ? "text-success-700" : "text-danger-700"}`}>
                      {m.net.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function TrialBalanceReport() {
  const today = new Date().toISOString().split("T")[0];
  const [asOf, setAsOf] = useState(today);
  const [fetch, setFetch] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["acc-tb", asOf],
    queryFn: () => accountingApi.trialBalance(asOf),
    enabled: fetch,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-default-400">As of Date</label>
          <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)}
            className="border border-default-200 rounded-lg px-3 py-1.5 text-sm bg-default-50" />
        </div>
        <Button color="primary" size="sm" isLoading={isLoading} onPress={() => setFetch(true)}>Generate</Button>
      </div>
      {data && (
        <Card>
          <CardBody>
            {!data.balanced && (
              <div className="bg-warning-50 border border-warning-200 text-warning-800 rounded-lg p-3 text-sm mb-4">
                ⚠️ Trial balance is not balanced — total debits ≠ total credits
              </div>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-default-100">
                  <th className="text-left py-2 text-default-400 font-medium">Code</th>
                  <th className="text-left py-2 text-default-400 font-medium">Account</th>
                  <th className="text-right py-2 text-default-400 font-medium">Debit (MYR)</th>
                  <th className="text-right py-2 text-default-400 font-medium">Credit (MYR)</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r: any) => (
                  <tr key={r.code} className="border-b border-default-50">
                    <td className="py-1.5 font-mono text-xs text-default-400">{r.code}</td>
                    <td className="py-1.5">{r.name}</td>
                    <td className="text-right py-1.5">{r.debit > 0 ? r.debit.toFixed(2) : "—"}</td>
                    <td className="text-right py-1.5">{r.credit > 0 ? r.credit.toFixed(2) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-default-200 font-bold">
                  <td colSpan={2} className="py-2">Total</td>
                  <td className="text-right py-2">{data.total_debit.toFixed(2)}</td>
                  <td className="text-right py-2">{data.total_credit.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

export default function ReportsTab() {
  const [report, setReport] = useState("pl");
  return (
    <div className="flex flex-col gap-4 pt-4">
      <Tabs selectedKey={report} onSelectionChange={(k) => setReport(k as string)} size="sm" variant="bordered">
        <Tab key="pl" title="P&amp;L Statement"><PLReport /></Tab>
        <Tab key="bs" title="Balance Sheet"><BalanceSheetReport /></Tab>
        <Tab key="cf" title="Cash Flow"><CashFlowReport /></Tab>
        <Tab key="tb" title="Trial Balance"><TrialBalanceReport /></Tab>
      </Tabs>
    </div>
  );
}
