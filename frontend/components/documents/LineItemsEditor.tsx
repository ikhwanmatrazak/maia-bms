"use client";

import React from "react";
import { useFieldArray, Control, UseFormRegister } from "react-hook-form";
import { Button, Input } from "@heroui/react";
import { TaxRate } from "@/types";

function SubItemsEditor({ control, register, itemIndex }: { control: Control<any>; register: UseFormRegister<any>; itemIndex: number }) {
  const { fields, append, remove } = useFieldArray({ control, name: `items.${itemIndex}.sub_items` });
  return (
    <div className="pl-3 mt-1 space-y-1">
      {fields.map((field, subIndex) => (
        <div key={field.id} className="flex items-center gap-1">
          <span className="text-gray-300 text-xs flex-shrink-0">↳</span>
          <Input
            variant="underlined"
            size="sm"
            placeholder="Sub item description"
            classNames={{ inputWrapper: "h-7 min-h-0", input: "text-xs" }}
            {...register(`items.${itemIndex}.sub_items.${subIndex}.text`)}
          />
          <button type="button" className="text-gray-400 hover:text-red-500 text-xs px-1 flex-shrink-0" onClick={() => remove(subIndex)}>✕</button>
        </div>
      ))}
      <button type="button" className="text-xs text-gray-400 hover:text-gray-600" onClick={() => append({ text: "" })}>
        + sub item
      </button>
    </div>
  );
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
              <th className="pb-2 w-[40%]">Description</th>
              <th className="pb-2 w-[10%]">Qty</th>
              <th className="pb-2 w-[22%]">Unit Price</th>
              <th className="pb-2 w-[22%]">Tax Rate</th>
              <th className="pb-2 w-[6%]"></th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field, index) => (
              <React.Fragment key={field.id}>
                <tr>
                  <td className="pt-2 pr-2">
                    <Input variant="bordered" size="sm" placeholder="Description" {...register(`items.${index}.description`)} />
                  </td>
                  <td className="pt-2 px-1">
                    <Input variant="bordered" size="sm" type="number" min="0" step="0.01" {...register(`items.${index}.quantity`)} />
                  </td>
                  <td className="pt-2 px-1">
                    <Input
                      variant="bordered" size="sm" type="number" min="0" step="0.01"
                      startContent={<span className="text-gray-400 text-xs">{currency}</span>}
                      {...register(`items.${index}.unit_price`)}
                    />
                  </td>
                  <td className="pt-2 px-1">
                    <select className="w-full text-sm border rounded-lg px-2 py-1.5 bg-white" {...register(`items.${index}.tax_rate_id`)}>
                      <option value="">No Tax</option>
                      {taxRates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.rate}%)</option>)}
                    </select>
                  </td>
                  <td className="pt-2 pl-1">
                    <Button size="sm" variant="light" color="danger" onPress={() => remove(index)} isDisabled={fields.length === 1}>✕</Button>
                  </td>
                </tr>
                <tr className="border-b">
                  <td colSpan={5} className="pb-2">
                    <SubItemsEditor control={control} register={register} itemIndex={index} />
                  </td>
                </tr>
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <Button
        size="sm" variant="flat" className="mt-3"
        onPress={() => append({ description: "", quantity: "1", unit_price: "0", tax_rate_id: "", sort_order: fields.length, sub_items: [] })}
      >
        + Add Line Item
      </Button>
    </div>
  );
}
