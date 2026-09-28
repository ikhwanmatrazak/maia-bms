"use client";

import { useState } from "react";
import { Button, Input } from "@heroui/react";
import { Plus, Trash2, ChevronDown, ChevronRight, X } from "lucide-react";
import { ContractTable } from "@/types";

interface Props {
  value: ContractTable[];
  onChange: (tables: ContractTable[]) => void;
}

const PRESETS = [
  { label: "Annual Services", headers: ["Description", "Amount (RM)"], cols: 2 },
  { label: "Total Contract Value", headers: ["Description", "Amount (RM)"], cols: 2 },
  { label: "Payment Schedule", headers: ["Milestone", "Description", "Amount (RM)"], cols: 3 },
  { label: "Custom Table", headers: ["Column 1", "Column 2"], cols: 2 },
];

function newTable(preset: typeof PRESETS[0]): ContractTable {
  return {
    title: preset.label === "Custom Table" ? "" : preset.label,
    headers: [...preset.headers],
    rows: [Array(preset.cols).fill("")],
    total_row: null,
  };
}

export function ContractTablesEditor({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [showPresets, setShowPresets] = useState(false);

  const update = (idx: number, table: ContractTable) => {
    const next = [...value];
    next[idx] = table;
    onChange(next);
  };

  const remove = (idx: number) => {
    const next = value.filter((_, i) => i !== idx);
    onChange(next);
    if (expandedIdx === idx) setExpandedIdx(null);
  };

  const addTable = (preset: typeof PRESETS[0]) => {
    const t = newTable(preset);
    const next = [...value, t];
    onChange(next);
    setExpandedIdx(next.length - 1);
    setShowPresets(false);
    setOpen(true);
  };

  const updateCell = (tIdx: number, rIdx: number, cIdx: number, val: string) => {
    const t = { ...value[tIdx], rows: value[tIdx].rows.map((r, ri) => ri === rIdx ? r.map((c, ci) => ci === cIdx ? val : c) : r) };
    update(tIdx, t);
  };

  const updateTotalCell = (tIdx: number, cIdx: number, val: string) => {
    const t = value[tIdx];
    const total_row = [...(t.total_row ?? Array(t.headers.length).fill(""))];
    total_row[cIdx] = val;
    update(tIdx, { ...t, total_row });
  };

  const addRow = (tIdx: number) => {
    const t = value[tIdx];
    update(tIdx, { ...t, rows: [...t.rows, Array(t.headers.length).fill("")] });
  };

  const removeRow = (tIdx: number, rIdx: number) => {
    const t = value[tIdx];
    update(tIdx, { ...t, rows: t.rows.filter((_, i) => i !== rIdx) });
  };

  const toggleTotalRow = (tIdx: number) => {
    const t = value[tIdx];
    update(tIdx, { ...t, total_row: t.total_row ? null : Array(t.headers.length).fill("") });
  };

  return (
    <div className="border border-default-200 rounded-xl">
      {/* Header toggle */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-default-50 hover:bg-default-100 transition-colors text-left rounded-xl"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span className="font-semibold text-sm">Contract Tables</span>
          {value.length > 0 && (
            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
              {value.length} table{value.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <span className="text-xs text-default-400">Annual Services, Payment Schedule, etc.</span>
      </button>

      {open && (
        <div className="p-4 space-y-4">
          {value.length === 0 && (
            <p className="text-sm text-default-400 text-center py-2">No tables added yet.</p>
          )}

          {value.map((table, tIdx) => (
            <div key={tIdx} className="border border-default-200 rounded-lg overflow-hidden">
              {/* Table header row */}
              <div
                className="flex items-center gap-2 px-3 py-2 bg-default-50 cursor-pointer"
                onClick={() => setExpandedIdx(expandedIdx === tIdx ? null : tIdx)}
              >
                {expandedIdx === tIdx ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="text-sm font-medium flex-1">{table.title || `Table ${tIdx + 1}`}</span>
                <span className="text-xs text-default-400">{table.rows.length} row{table.rows.length !== 1 ? "s" : ""}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); remove(tIdx); }}
                  className="text-danger hover:text-danger-600 p-1"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {expandedIdx === tIdx && (
                <div className="p-3 space-y-3">
                  {/* Title */}
                  <Input
                    size="sm"
                    variant="bordered"
                    label="Table Title"
                    value={table.title}
                    onChange={(e) => update(tIdx, { ...table, title: e.target.value })}
                  />

                  {/* Column headers */}
                  <div>
                    <p className="text-xs text-default-500 mb-1 font-medium">Column Headers</p>
                    <div className="flex gap-2 flex-wrap">
                      {table.headers.map((h, hIdx) => (
                        <div key={hIdx} className="flex items-center gap-1">
                          <input
                            className="border border-default-200 rounded-lg px-2 py-1 text-sm w-36 outline-none focus:border-primary"
                            value={h}
                            onChange={(e) => {
                              const headers = table.headers.map((v, i) => i === hIdx ? e.target.value : v);
                              update(tIdx, { ...table, headers });
                            }}
                            placeholder={`Header ${hIdx + 1}`}
                          />
                          {table.headers.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                const headers = table.headers.filter((_, i) => i !== hIdx);
                                const rows = table.rows.map(r => r.filter((_, i) => i !== hIdx));
                                const total_row = table.total_row ? table.total_row.filter((_, i) => i !== hIdx) : null;
                                update(tIdx, { ...table, headers, rows, total_row });
                              }}
                              className="text-default-400 hover:text-danger"
                            >
                              <X size={13} />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          const headers = [...table.headers, `Col ${table.headers.length + 1}`];
                          const rows = table.rows.map(r => [...r, ""]);
                          const total_row = table.total_row ? [...table.total_row, ""] : null;
                          update(tIdx, { ...table, headers, rows, total_row });
                        }}
                        className="text-xs text-primary hover:underline px-1"
                      >
                        + column
                      </button>
                    </div>
                  </div>

                  {/* Data rows */}
                  <div>
                    <p className="text-xs text-default-500 mb-1 font-medium">Rows</p>
                    <div className="space-y-1">
                      {table.rows.map((row, rIdx) => (
                        <div key={rIdx} className="flex gap-1 items-center">
                          {row.map((cell, cIdx) => (
                            <input
                              key={cIdx}
                              className="border border-default-200 rounded-lg px-2 py-1.5 text-sm flex-1 min-w-0 outline-none focus:border-primary"
                              value={cell}
                              onChange={(e) => updateCell(tIdx, rIdx, cIdx, e.target.value)}
                              placeholder={table.headers[cIdx] || `Col ${cIdx + 1}`}
                            />
                          ))}
                          <button
                            type="button"
                            onClick={() => removeRow(tIdx, rIdx)}
                            className="text-default-300 hover:text-danger shrink-0"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => addRow(tIdx)}
                      className="mt-1 text-xs text-primary hover:underline"
                    >
                      + Add row
                    </button>
                  </div>

                  {/* Total row toggle */}
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <input
                        type="checkbox"
                        id={`total-row-${tIdx}`}
                        checked={!!table.total_row}
                        onChange={() => toggleTotalRow(tIdx)}
                        className="cursor-pointer"
                      />
                      <label htmlFor={`total-row-${tIdx}`} className="text-xs text-default-500 font-medium cursor-pointer">
                        Show total row (bold)
                      </label>
                    </div>
                    {table.total_row && (
                      <div className="flex gap-1 items-center">
                        {table.total_row.map((cell, cIdx) => (
                          <input
                            key={cIdx}
                            className="border border-default-200 rounded-lg px-2 py-1.5 text-sm flex-1 min-w-0 outline-none focus:border-primary font-semibold"
                            value={cell}
                            onChange={(e) => updateTotalCell(tIdx, cIdx, e.target.value)}
                            placeholder={cIdx === 0 ? "Total label" : "Total amount"}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Add table */}
          <div className="relative">
            <Button
              type="button"
              size="sm"
              variant="flat"
              color="primary"
              startContent={<Plus size={14} />}
              onPress={() => setShowPresets(!showPresets)}
            >
              Add Table
            </Button>
            {showPresets && (
              <div className="absolute top-8 left-0 z-20 bg-white dark:bg-default-100 border border-default-200 rounded-xl shadow-lg p-2 min-w-[220px]">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => addTable(p)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-default-100 rounded-lg transition-colors"
                  >
                    {p.label}
                    <span className="text-xs text-default-400 ml-1">({p.cols} cols)</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
