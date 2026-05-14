"use client";

import { Badge } from "@yelli/ui/badge";
import { Button } from "@yelli/ui/button";
import { Card, CardContent } from "@yelli/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@yelli/ui/dialog";
import { Input } from "@yelli/ui/input";
import { Label } from "@yelli/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@yelli/ui/select";
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

type Role = "tenant_admin" | "host" | "participant";

interface InviteFormValues {
  email: string;
  display_name: string;
  role: Role;
}

const EMPTY_INVITE: InviteFormValues = {
  email: "",
  display_name: "",
  role: "participant",
};

export default function AdminUsersPage(): JSX.Element {
  const utils = trpc.useUtils();
  const list = trpc.admin.users.list.useQuery();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [form, setForm] = useState<InviteFormValues>(EMPTY_INVITE);
  const [credentialResult, setCredentialResult] = useState<{
    email: string;
    temp_password: string;
  } | null>(null);

  const invite = trpc.admin.users.invite.useMutation({
    onSuccess: (result) => {
      utils.admin.users.list.invalidate();
      setInviteOpen(false);
      setForm(EMPTY_INVITE);
      setCredentialResult({
        email: result.email,
        temp_password: result.temp_password,
      });
    },
    onError: (err) => {
      toast({
        title: "Invite failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const updateRole = trpc.admin.users.updateRole.useMutation({
    onSuccess: () => {
      utils.admin.users.list.invalidate();
      toast({ title: "Role updated" });
    },
    onError: (err) => {
      toast({
        title: "Role update failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const deactivate = trpc.admin.users.deactivate.useMutation({
    onSuccess: (result) => {
      utils.admin.users.list.invalidate();
      toast({
        title:
          result.status === "active" ? "User reactivated" : "User deactivated",
      });
    },
    onError: (err) => {
      toast({
        title: "Status change failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  function submitInvite(e: React.FormEvent): void {
    e.preventDefault();
    invite.mutate({
      email: form.email.trim().toLowerCase(),
      display_name: form.display_name.trim(),
      role: form.role,
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage team members, roles, and access.
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>Invite user</Button>
      </header>

      <Card>
        <CardContent className="p-0">
          {list.isLoading && (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          )}
          {list.data && list.data.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground">
              No users yet. Invite your first teammate.
            </p>
          )}
          {list.data && list.data.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last seen</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.display_name}
                      {u.is_super_admin && (
                        <Badge variant="info" className="ml-2">
                          super
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {u.email}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={u.role}
                        onValueChange={(role) =>
                          updateRole.mutate({
                            user_id: u.id,
                            role: role as Role,
                          })
                        }
                        disabled={updateRole.isPending}
                      >
                        <SelectTrigger className="h-8 w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tenant_admin">Admin</SelectItem>
                          <SelectItem value="host">Host</SelectItem>
                          <SelectItem value="participant">Participant</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {u.status === "active" ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="outline">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.last_seen_at
                        ? new Date(u.last_seen_at).toLocaleString()
                        : "Never"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className={
                          u.status === "active"
                            ? "text-destructive hover:text-destructive"
                            : ""
                        }
                        onClick={() => deactivate.mutate({ user_id: u.id })}
                        disabled={deactivate.isPending}
                      >
                        {u.status === "active" ? "Deactivate" : "Reactivate"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite user</DialogTitle>
            <DialogDescription>
              A temporary password will be generated. Share it with the user via
              a secure channel; they should change it on first sign-in.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitInvite} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="display_name">Display name</Label>
              <Input
                id="display_name"
                value={form.display_name}
                onChange={(e) =>
                  setForm({ ...form, display_name: e.target.value })
                }
                required
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select
                value={form.role}
                onValueChange={(role) =>
                  setForm({ ...form, role: role as Role })
                }
              >
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tenant_admin">Admin</SelectItem>
                  <SelectItem value="host">Host</SelectItem>
                  <SelectItem value="participant">Participant</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setInviteOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={invite.isPending}>
                Invite
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Credential display — shown ONCE after invite */}
      <Dialog
        open={credentialResult !== null}
        onOpenChange={(open) => !open && setCredentialResult(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>User invited</DialogTitle>
            <DialogDescription>
              Share this temporary password with{" "}
              <strong>{credentialResult?.email}</strong> via a secure channel. It
              will not be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/40 p-3">
            <code className="block break-all font-mono text-xs">
              {credentialResult?.temp_password}
            </code>
          </div>
          <DialogFooter>
            <Button
              onClick={async () => {
                if (credentialResult) {
                  await navigator.clipboard.writeText(
                    credentialResult.temp_password,
                  );
                  toast({ title: "Password copied" });
                }
              }}
            >
              Copy password
            </Button>
            <Button
              variant="outline"
              onClick={() => setCredentialResult(null)}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
