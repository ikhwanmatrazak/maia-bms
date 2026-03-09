"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
  Button, Input, Chip, Link as HeroLink,
} from "@heroui/react";
import Link from "next/link";
import { Eye } from "lucide-react";
import { clientsApi } from "@/lib/api";
import { Client } from "@/types";
import { formatDate, formatCurrency, statusColor } from "@/lib/utils";
import { Topbar } from "@/components/ui/Topbar";

const PAGE_SIZE = 20;

export default function ClientsPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const { data: clients = [], isLoading } = useQuery<Client[]>({
    queryKey: ["clients", search, page],
    queryFn: () => clientsApi.list({
      ...(search ? { search } : {}),
      skip: (page - 1) * PAGE_SIZE,
      limit: PAGE_SIZE,
    }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => clientsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clients"] }),
  });

  return (
    <div>
      <Topbar title="Clients" />
      <div className="p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <Input
            variant="bordered"
            placeholder="Search clients..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full sm:max-w-xs"
            size="sm"
          />
          <Button as={Link} href="/clients/new" color="primary">
            + New Client
          </Button>
        </div>

        <div className="overflow-x-auto -mx-1">
        <Table aria-label="Clients" isLoading={isLoading}>
          <TableHeader>
            <TableColumn>Company</TableColumn>
            <TableColumn>Contact</TableColumn>
            <TableColumn>Email</TableColumn>
            <TableColumn>Currency</TableColumn>
            <TableColumn>Status</TableColumn>
            <TableColumn>Outstanding</TableColumn>
            <TableColumn>Since</TableColumn>
            <TableColumn className="w-px whitespace-nowrap">Actions</TableColumn>
          </TableHeader>
          <TableBody>
            {clients.map((client) => (
              <TableRow key={client.id}>
                <TableCell>
                  <Link href={`/clients/${client.id}`} className="text-primary font-medium hover:underline">
                    {client.company_name}
                  </Link>
                </TableCell>
                <TableCell>{client.contact_person ?? "—"}</TableCell>
                <TableCell>{client.email ?? "—"}</TableCell>
                <TableCell>{client.currency}</TableCell>
                <TableCell>
                  <Chip size="sm" color={statusColor(client.status)} variant="flat">
                    {client.status}
                  </Chip>
                </TableCell>
                <TableCell>
                  {parseFloat(client.outstanding_balance ?? "0") > 0 ? (
                    <span className="text-danger font-medium">{formatCurrency(client.outstanding_balance!, client.currency)}</span>
                  ) : (
                    <span className="text-success text-sm">—</span>
                  )}
                </TableCell>
                <TableCell>{formatDate(client.created_at)}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button as={Link} href={`/clients/${client.id}`} size="sm" variant="flat" isIconOnly title="View"><Eye size={15} /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>

        <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
          <span>Page {page}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="flat" isDisabled={page === 1} onPress={() => setPage(p => p - 1)}>Previous</Button>
            <Button size="sm" variant="flat" isDisabled={clients.length < PAGE_SIZE} onPress={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
