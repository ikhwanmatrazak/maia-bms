"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Button } from "@heroui/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authApi } from "@/lib/api";
import { setTokens, setUser } from "@/lib/auth";

const schema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});
type LoginForm = z.infer<typeof schema>;

const features = [
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    ),
    title: "Quotations & Invoices",
    desc: "Generate professional PDF documents instantly",
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
      </svg>
    ),
    title: "Revenue Reports",
    desc: "Track income, expenses and profit & loss",
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
      </svg>
    ),
    title: "Client Management",
    desc: "Manage clients, payments and reminders",
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    setError(null);
    try {
      const response = await authApi.login(data.email, data.password);
      setTokens(response.access_token, response.refresh_token);
      setUser({
        id: response.user_id,
        name: response.name,
        email: response.email,
        role: response.role,
        is_super_admin: response.is_super_admin,
        tenant_id: response.tenant_id,
      });
      router.push("/dashboard");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: unknown } } };
      const detail = e?.response?.data?.detail;
      if (typeof detail === "string") {
        setError(detail);
      } else if (Array.isArray(detail)) {
        setError((detail as Array<{ msg?: string }>).map((d) => d.msg ?? "").filter(Boolean).join(", ") || "Login failed.");
      } else {
        setError("Login failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-4xl flex rounded-2xl overflow-hidden shadow-2xl min-h-[520px]">
      {/* Left panel — branding */}
      <div className="hidden md:flex flex-col justify-between w-1/2 bg-[#1a1a2e] p-10 text-white">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="size-6 text-white/80">
              <path d="M11.47 3.841a.75.75 0 0 1 1.06 0l8.69 8.69a.75.75 0 1 0 1.06-1.061l-8.689-8.69a2.25 2.25 0 0 0-3.182 0l-8.69 8.69a.75.75 0 1 0 1.061 1.06l8.69-8.689Z" />
              <path d="m12 5.432 8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 0 1-.75-.75v-4.5a.75.75 0 0 0-.75-.75h-3a.75.75 0 0 0-.75.75V21a.75.75 0 0 1-.75.75H5.625a1.875 1.875 0 0 1-1.875-1.875v-6.198a2.29 2.29 0 0 0 .091-.086L12 5.432Z" />
            </svg>
            <span className="text-lg font-bold tracking-wide">MAIA BMS</span>
          </div>
          <p className="text-white/40 text-xs">Business Management System</p>
        </div>

        <div className="space-y-1">
          <p className="text-2xl font-semibold leading-snug">
            Run your business<br />with clarity.
          </p>
          <p className="text-white/50 text-sm mt-2">
            Everything you need to manage clients,<br />documents and finances in one place.
          </p>
        </div>

        <div className="space-y-5">
          {features.map((f) => (
            <div key={f.title} className="flex items-start gap-3">
              <div className="mt-0.5 text-white/60 shrink-0">{f.icon}</div>
              <div>
                <p className="text-sm font-medium">{f.title}</p>
                <p className="text-xs text-white/40">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-white/20 text-xs">&copy; {new Date().getFullYear()} MAIA</p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 bg-white flex flex-col justify-center px-10 py-12">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-foreground">Welcome back</h2>
          <p className="text-sm text-default-400 mt-1">Sign in to your account to continue</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {error && (
            <div className="bg-danger-50 text-danger text-sm px-4 py-3 rounded-lg border border-danger-100">
              {error}
            </div>
          )}
          <Input
            variant="bordered"
            label="Email"
            type="email"
            placeholder="you@company.com"
            isInvalid={!!errors.email}
            errorMessage={errors.email?.message}
            startContent={
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4 text-default-400 shrink-0">
                <path d="M3 4a2 2 0 0 0-2 2v1.161l8.441 4.221a1.25 1.25 0 0 0 1.118 0L19 7.162V6a2 2 0 0 0-2-2H3Z" />
                <path d="m19 8.839-7.77 3.885a2.75 2.75 0 0 1-2.46 0L1 8.839V14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.839Z" />
              </svg>
            }
            {...register("email")}
          />
          <Input
            variant="bordered"
            label="Password"
            type="password"
            placeholder="••••••••"
            isInvalid={!!errors.password}
            errorMessage={errors.password?.message}
            startContent={
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4 text-default-400 shrink-0">
                <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" />
              </svg>
            }
            {...register("password")}
          />
          <Button
            type="submit"
            color="primary"
            className="mt-1 font-medium"
            isLoading={loading}
            fullWidth
            size="lg"
          >
            Sign In
          </Button>
        </form>
      </div>
    </div>
  );
}
