"use client";

import { useFieldArray, Control, UseFormRegister } from "react-hook-form";
import { Button, Input, Select, SelectItem } from "@heroui/react";
import { TaxRate } from "@/types";

interface LineItem {
  description: string;
  quantity: string;
  unit_price: string;
  tax_rate_id?: string;
  sort_order?: number;
}

interface Props {
  control: Control<any>;
  register: UseFormRegister<any>;
  taxRates: TaxRate[];
  currency: string;
}

export function LineItemsEditor({ control, register, taxRates, currency }: Props) {
  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="pb-2 w-2/5">Description</th>
              <th className="pb-2 w-1/8 text-right">Qty</th>
              <th className="pb-2 w-1/6 text-right">Unit Price</th>
              <th className="pb-2 w-1/5">Tax Rate</th>
              <th className="pb-2 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field, index) => (
              <tr key={field.id} className="border-b">
                <td className="py-2 pr-2">
                  <Input
                    size="sm"
                    placeholder="Description"
                    {...register(`items.${index}.description`)}
                  />
                </td>
                <td className="py-2 px-1">
                  <Input
                    size="sm"
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-20"
                    {...register(`items.${index}.quantity`)}
                  />
                </td>
                <td className="py-2 px-1">
                  <Input
                    size="sm"
                    type="number"
                    min="0"
                    step="0.01"
                    startContent={<span className="text-gray-400 text-xs">{currency}</span>}
                    className="w-32"
                    {...register(`items.${index}.unit_price`)}
                  />
                </td>
                <td className="py-2 px-1">
                  <select
                    className="w-full text-sm border rounded-lg px-2 py-1.5 bg-white"
                    {...register(`items.${index}.tax_rate_id`)}
                  >
                    <option value="">No Tax</option>
                    {taxRates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.rate}%)
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2 pl-1">
                  <Button
                    size="sm"
                    variant="light"
                    color="danger"
                    onPress={() => remove(index)}
                    isDisabled={fields.length === 1}
                  >
                    ✕
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button
        size="sm"
        variant="flat"
        className="mt-3"
        onPress={() =>
          append({
            description: "",
            quantity: "1",
            unit_price: "0",
            tax_rate_id: "",
            sort_order: fields.length,
          })
        }
      >
        + Add Line Item
      </Button>
    </div>
  );
}
