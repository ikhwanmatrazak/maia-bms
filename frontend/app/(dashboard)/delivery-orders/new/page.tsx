"use client";

import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardBody, CardHeader, Button, Input, Select, SelectItem, Textarea } from "@heroui/react";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { deliveryOrdersApi, clientsApi } from "@/lib/api";
import { Client } from "@/types";
import { Topbar } from "@/components/ui/Topbar";

export default function NewDeliveryOrderPage() {
  const router = useRouter();

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["clients"],
    queryFn: () => clientsApi.list(),
  });

  const { register, handleSubmit, control } = useForm({
    defaultValues: {
      client_id: "",
      issue_date: new Date().toISOString().split("T")[0],
      delivery_date: "",
      delivery_address: "",
      notes: "",
      items: [{ description: "", quantity: "1", unit: "pcs" }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => deliveryOrdersApi.create(data),
    onSuccess: (result) => router.push(`/delivery-orders/${result.id}`),
  });

  const onSubmit = (data: Record<string, unknown>) => {
    mutation.mutate({
      ...data,
      client_id: Number(data.client_id),
      issue_date: new Date(data.issue_date as string).toISOString(),
      delivery_date: data.delivery_date ? new Date(data.delivery_date as string).toISOString() : null,
      items: (data.items as Array<Record<string, any>>).map((item, i) => ({
        description: item.description,
        quantity: Number(item.quantity),
        unit: item.unit || "pcs",
        sort_order: i,
      })),
    });
  };

  return (
    <div>
      <Topbar title="New Delivery Order" />
      <div className="p-6">
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-6">
            <Card>
              <CardHeader><h3 className="font-semibold">Delivery Details</h3></CardHeader>
              <CardBody className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Controller name="client_id" control={control} render={({ field }) => (
                  <Select variant="bordered" label="Client *"
                    selectedKeys={field.value ? [field.value] : []}
                    onSelectionChange={(keys) => field.onChange(Array.from(keys)[0])}>
                    {clients.map((c) => <SelectItem key={String(c.id)}>{c.company_name}</SelectItem>)}
                  </Select>
                )} />
                <Input variant="bordered" label="Issue Date" type="date" {...register("issue_date")} />
                <Input variant="bordered" label="Delivery Date" type="date" {...register("delivery_date")} />
                <Textarea variant="bordered" label="Delivery Address" {...register("delivery_address")} />
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between w-full">
                  <h3 className="font-semibold">Items</h3>
                  <Button size="sm" variant="flat" onPress={() => append({ description: "", quantity: "1", unit: "pcs" })}
                    startContent={<Plus size={14} />}>Add Item</Button>
                </div>
              </CardHeader>
              <CardBody className="space-y-3">
                {fields.map((field, index) => (
                  <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                    <div className="col-span-6">
                      <Input variant="bordered" label="Description" size="sm"
                        {...register(`items.${index}.description`)} />
                    </div>
                    <div className="col-span-2">
                      <Input variant="bordered" label="Qty" size="sm" type="number" step="0.01"
                        {...register(`items.${index}.quantity`)} />
                    </div>
                    <div className="col-span-3">
                      <Input variant="bordered" label="Unit" size="sm" placeholder="pcs"
                        {...register(`items.${index}.unit`)} />
                    </div>
                    <div className="col-span-1 flex items-center justify-center pt-4">
                      {fields.length > 1 && (
                        <Button size="sm" isIconOnly variant="flat" color="danger" onPress={() => remove(index)}>
                          <Trash2 size={14} />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>

            <Card>
              <CardHeader><h3 className="font-semibold">Notes</h3></CardHeader>
              <CardBody>
                <Textarea variant="bordered" label="Notes" {...register("notes")} />
              </CardBody>
            </Card>

            {mutation.isError && <p className="text-danger text-sm">Failed to create delivery order.</p>}
            <div className="flex gap-3">
              <Button type="submit" color="primary" isLoading={mutation.isPending}>Create Delivery Order</Button>
              <Button variant="flat" onPress={() => router.back()}>Cancel</Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
