"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Card, CardBody, CardHeader, Input, Button, Select, SelectItem, Textarea } from "@heroui/react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { clientsApi } from "@/lib/api";
import { Topbar } from "@/components/ui/Topbar";

const schema = z.object({
  company_name: z.string().min(1, "Company name is required"),
  contact_person: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  currency: z.string().default("MYR"),
  notes: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

const CURRENCIES = ["MYR", "USD", "EUR", "GBP", "SGD", "AUD", "JPY", "CNY"];

export default function NewClientPage() {
  const router = useRouter();
  const { register, handleSubmit, control, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { currency: "MYR" },
  });

  const mutation = useMutation({
    mutationFn: (data: FormData) => clientsApi.create(data),
    onSuccess: (result) => router.push(`/clients/${result.id}`),
  });

  return (
    <div>
      <Topbar title="New Client" />
      <div className="p-6">
        <Card>
          <CardHeader>
            <h3 className="font-semibold">Client Information</h3>
          </CardHeader>
          <CardBody>
            <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="flex flex-col gap-4">
              <Input
                variant="bordered"
                label="Company Name *"
                isInvalid={!!errors.company_name}
                errorMessage={errors.company_name?.message}
                {...register("company_name")}
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  variant="bordered"
                  label="Contact Person"
                  {...register("contact_person")}
                />
                <Input variant="bordered" label="Email" type="email" {...register("email")} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  variant="bordered"
                  label="Phone"
                  {...register("phone")}
                />
                <Controller
                  name="currency"
                  control={control}
                  render={({ field }) => (
                    <Select
                      variant="bordered"
                      label="Currency"
                      selectedKeys={[field.value]}
                      onSelectionChange={(keys) => field.onChange(Array.from(keys)[0])}
                    >
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c}>{c}</SelectItem>
                      ))}
                    </Select>
                  )}
                />
              </div>
              <Textarea variant="bordered" label="Address" {...register("address")} />
              <div className="grid grid-cols-2 gap-4">
                <Input variant="bordered" label="City" {...register("city")} />
                <Input variant="bordered" label="Country" {...register("country")} />
              </div>
              <Textarea variant="bordered" label="Notes" {...register("notes")} />
              {mutation.isError && (
                <p className="text-danger text-sm">Failed to create client. Please try again.</p>
              )}
              <div className="flex gap-3">
                <Button type="submit" color="primary" isLoading={mutation.isPending}>
                  Create Client
                </Button>
                <Button variant="flat" onPress={() => router.back()}>Cancel</Button>
              </div>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
