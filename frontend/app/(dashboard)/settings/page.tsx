"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardBody, CardHeader, Button, Input, Textarea } from "@heroui/react";
import { useForm } from "react-hook-form";
import { settingsApi } from "@/lib/api";
import { CompanySettings } from "@/types";
import { Topbar } from "@/components/ui/Topbar";
import { useState } from "react";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [smtpTestEmail, setSmtpTestEmail] = useState("");
  const [smtpTestResult, setSmtpTestResult] = useState<string | null>(null);

  const { data: settings } = useQuery<CompanySettings>({
    queryKey: ["settings", "company"],
    queryFn: settingsApi.getCompany,
  });

  const { register, handleSubmit, reset } = useForm<Record<string, string>>({
    values: settings as unknown as Record<string, string> ?? {},
  });

  const updateMutation = useMutation({
    mutationFn: (data: object) => settingsApi.updateCompany(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
  });

  const logoMutation = useMutation({
    mutationFn: (file: File) => settingsApi.uploadLogo(file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
  });

  const smtpTestMutation = useMutation({
    mutationFn: (email: string) => settingsApi.testSmtp(email),
    onSuccess: () => setSmtpTestResult("Test email sent successfully!"),
    onError: () => setSmtpTestResult("Failed to send test email. Check SMTP settings."),
  });

  return (
    <div>
      <Topbar title="Settings" />
      <div className="p-6 max-w-3xl space-y-6">
        {/* Company Info */}
        <Card>
          <CardHeader><h3 className="font-semibold">Company Information</h3></CardHeader>
          <CardBody>
            <form onSubmit={handleSubmit((d) => updateMutation.mutate(d))} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <Input label="Company Name" {...register("name")} />
                <Input label="Email" type="email" {...register("email")} />
                <Input label="Phone" {...register("phone")} />
                <Input label="Website" {...register("website")} />
                <Input label="Default Currency" {...register("default_currency")} />
                <Input label="Payment Terms (days)" type="number" {...register("default_payment_terms")} />
                <Input label="Invoice Prefix" {...register("invoice_prefix")} />
                <Input label="Quotation Prefix" {...register("quotation_prefix")} />
                <Input label="Receipt Prefix" {...register("receipt_prefix")} />
              </div>
              <Textarea label="Address" {...register("address")} />
              <div className="flex gap-3">
                <Button type="submit" color="primary" className="bg-[#1a1a2e]" isLoading={updateMutation.isPending}>Save</Button>
              </div>
            </form>
          </CardBody>
        </Card>

        {/* Logo Upload */}
        <Card>
          <CardHeader><h3 className="font-semibold">Company Logo</h3></CardHeader>
          <CardBody className="flex flex-col gap-3">
            {settings?.logo_url && (
              <img src={`${process.env.NEXT_PUBLIC_API_URL?.replace("/api/v1", "")}${settings.logo_url}`} alt="Logo" className="h-16 object-contain" />
            )}
            <input
              type="file"
              accept="image/*"
              className="text-sm"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) logoMutation.mutate(file);
              }}
            />
          </CardBody>
        </Card>

        {/* SMTP */}
        <Card>
          <CardHeader><h3 className="font-semibold">SMTP Settings</h3></CardHeader>
          <CardBody>
            <form onSubmit={handleSubmit((d) => updateMutation.mutate(d))} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <Input label="SMTP Host" {...register("smtp_host")} />
                <Input label="SMTP Port" type="number" {...register("smtp_port")} />
                <Input label="SMTP User" {...register("smtp_user")} />
                <Input label="SMTP Password" type="password" {...register("smtp_password" as keyof Record<string, string>)} />
                <Input label="From Email" type="email" {...register("smtp_from_email")} />
                <Input label="From Name" {...register("smtp_from_name")} />
              </div>
              <div className="flex gap-3 items-center flex-wrap">
                <Button type="submit" color="primary" className="bg-[#1a1a2e]" isLoading={updateMutation.isPending}>Save SMTP</Button>
                <div className="flex gap-2 items-center">
                  <Input
                    size="sm"
                    placeholder="test@email.com"
                    value={smtpTestEmail}
                    onChange={(e) => setSmtpTestEmail(e.target.value)}
                    className="w-48"
                  />
                  <Button size="sm" variant="flat" isLoading={smtpTestMutation.isPending}
                    onPress={() => smtpTestMutation.mutate(smtpTestEmail)}>Test</Button>
                </div>
                {smtpTestResult && <p className={`text-sm ${smtpTestResult.includes("success") ? "text-success" : "text-danger"}`}>{smtpTestResult}</p>}
              </div>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
