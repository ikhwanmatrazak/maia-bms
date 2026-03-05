"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
  Button, Input, Chip, Link as HeroLink,
} from "@heroui/react";
import Link from "next/link";
import { clientsApi } from "@/lib/api";
import { Client } from "@/types";
import { formatDate, statusColor } from "@/lib/utils";
import { Topbar } from "@/components/ui/Topbar";

export default function ClientsPage() {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  const { data: clients = [], isLoading } = useQuery<Client[]>({
    queryKey: ["clients", search],
    queryFn: () => clientsApi.list(search ? { search } : {}),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => clientsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clients"] }),
  });

  return (
    <div>
      <Topbar title="Clients" />
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <Input
            variant="bordered"
            placeholder="Search clients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
            size="sm"
          />
          <Button as={Link} href="/clients/new" color="primary">
            + New Client
          </Button>
        </div>

        <Table aria-label="Clients" isLoading={isLoading}>
          <TableHeader>
            <TableColumn>Company</TableColumn>
            <TableColumn>Contact</TableColumn>
            <TableColumn>Email</TableColumn>
            <TableColumn>Currency</TableColumn>
            <TableColumn>Status</TableColumn>
            <TableColumn>Since</TableColumn>
            <TableColumn>Actions</TableColumn>
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
                <TableCell>{formatDate(client.created_at)}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button as={Link} href={`/clients/${client.id}`} size="sm" variant="flat">
                      View
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
