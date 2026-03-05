"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader, Input, Button } from "@heroui/react";
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
      });
      router.push("/dashboard");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e?.response?.data?.detail ?? "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md shadow-2xl">
      <CardHeader className="flex flex-col items-center gap-1 pt-8 pb-4">
        <h1 className="text-2xl font-bold text-[#1a1a2e]">MAIA BMS</h1>
        <p className="text-sm text-gray-500">Business Management System</p>
      </CardHeader>
      <CardBody className="pb-8 px-8">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {error && (
            <div className="bg-danger-50 text-danger text-sm px-4 py-3 rounded-lg">
              {error}
            </div>
          )}
          <Input
            label="Email"
            type="email"
            placeholder="you@company.com"
            isInvalid={!!errors.email}
            errorMessage={errors.email?.message}
            {...register("email")}
          />
          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            isInvalid={!!errors.password}
            errorMessage={errors.password?.message}
            {...register("password")}
          />
          <Button
            type="submit"
            color="primary"
            className="mt-2 bg-[#1a1a2e]"
            isLoading={loading}
            fullWidth
          >
            Sign In
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
