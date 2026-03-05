import { format, formatDistanceToNow } from "date-fns";

export function formatDate(date: string | Date, fmt = "dd MMM yyyy"): string {
  return format(new Date(date), fmt);
}

export function formatRelative(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function formatCurrency(
  amount: string | number,
  currency = "MYR"
): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(num);
}

export function statusColor(status: string): "default" | "primary" | "secondary" | "success" | "warning" | "danger" {
  const map: Record<string, "default" | "primary" | "secondary" | "success" | "warning" | "danger"> = {
    draft: "default",
    sent: "primary",
    accepted: "success",
    rejected: "danger",
    expired: "warning",
    paid: "success",
    partial: "warning",
    overdue: "danger",
    cancelled: "default",
    active: "success",
    inactive: "default",
  };
  return map[status] ?? "default";
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}
