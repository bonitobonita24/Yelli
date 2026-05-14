"use client";

import { Badge } from "@yelli/ui/badge";
import { Button } from "@yelli/ui/button";
import { Card, CardContent } from "@yelli/ui/card";
import { Input } from "@yelli/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@yelli/ui/table";
import { toast } from "@yelli/ui/use-toast";
import { useState } from "react";

import { trpc } from "@/lib/trpc/react";

/**
 * Super-admin organizations dashboard.
 * Backed by superadmin.organizations.* which uses platformPrisma — no L6
 * tenant guard. All actions logged with PLATFORM:* audit prefix.
 */
export default function SuperAdminOrganizationsPage(): JSX.Element {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");

  const list = trpc.superadmin.organizations.list.useQuery(
    search.trim().length > 0 ? { search: search.trim(), limit: 50 } : undefined,
  );

  const suspend = trpc.superadmin.organizations.suspend.useMutation({
    onSuccess: (result) => {
      utils.superadmin.organizations.list.invalidate();
      toast({
        title: result.already ? "Already suspended" : "Organization suspended",
      });
    },
    onError: (err) => {
      toast({
        title: "Suspend failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const unsuspend = trpc.superadmin.organizations.unsuspend.useMutation({
    onSuccess: (result) => {
      utils.superadmin.organizations.list.invalidate();
      toast({
        title: result.already ? "Already active" : "Organization unsuspended",
      });
    },
    onError: (err) => {
      toast({
        title: "Unsuspend failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Organizations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All tenants on this platform. Suspend invalidates every active session.
        </p>
      </header>

      <div className="flex max-w-md gap-2">
        <Input
          placeholder="Search by name, slug, or billing email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <Button variant="outline" onClick={() => setSearch("")}>
            Clear
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {list.isLoading && (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          )}
          {list.data && list.data.items.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground">
              No organizations match.
            </p>
          )}
          {list.data && list.data.items.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead className="text-center">Users</TableHead>
                  <TableHead className="text-center">Depts</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.items.map((org) => (
                  <TableRow key={org.id}>
                    <TableCell className="font-medium">
                      {org.name}
                      <p className="text-xs text-muted-foreground">
                        {org.billing_email}
                      </p>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {org.slug}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          org.plan_tier === "free"
                            ? "secondary"
                            : org.plan_tier === "pro"
                              ? "default"
                              : "info"
                        }
                        className="capitalize"
                      >
                        {org.plan_tier}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {org._count.users}
                    </TableCell>
                    <TableCell className="text-center">
                      {org._count.departments}
                    </TableCell>
                    <TableCell>
                      {org.suspended_at ? (
                        <Badge variant="destructive">Suspended</Badge>
                      ) : (
                        <Badge variant="success">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {org.suspended_at ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            unsuspend.mutate({ organization_id: org.id })
                          }
                          disabled={unsuspend.isPending}
                        >
                          Unsuspend
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            if (
                              confirm(
                                `Suspend "${org.name}"? All active sessions will be invalidated.`,
                              )
                            ) {
                              suspend.mutate({ organization_id: org.id });
                            }
                          }}
                          disabled={suspend.isPending}
                        >
                          Suspend
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
