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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@yelli/ui/table";
import { Textarea } from "@yelli/ui/textarea";
import { toast } from "@yelli/ui/use-toast";
import { useState } from "react";

import { trpc } from "@/lib/trpc/react";

interface DepartmentFormValues {
  name: string;
  description: string;
  group_label: string;
  sort_order: string;
  auto_answer_enabled: boolean;
}

const EMPTY_FORM: DepartmentFormValues = {
  name: "",
  description: "",
  group_label: "",
  sort_order: "0",
  auto_answer_enabled: false,
};

// Minimal CSV parser — handles quoted fields + escaped quotes. RFC 4180 baseline.
function parseCsv(input: string): Array<Record<string, string>> {
  const lines = input.replace(/\r\n?/g, "\n").trim().split("\n");
  if (lines.length < 2) return [];
  const headerLine = lines[0];
  const dataLines = lines.slice(1);
  if (headerLine === undefined) return [];
  const headers = headerLine.split(",").map((h) => h.trim());
  return dataLines.map((line) => {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else if (ch === ",") {
        cells.push(current);
        current = "";
      } else if (ch === '"') {
        inQuotes = true;
      } else {
        current += ch ?? "";
      }
    }
    cells.push(current);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (cells[idx] ?? "").trim();
    });
    return row;
  });
}

export default function AdminDepartmentsPage(): JSX.Element {
  const utils = trpc.useUtils();
  const list = trpc.departments.list.useQuery();

  const [editing, setEditing] = useState<{ id: string | null } | null>(null);
  const [form, setForm] = useState<DepartmentFormValues>(EMPTY_FORM);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [tokenDisplay, setTokenDisplay] = useState<{
    id: string;
    token: string;
  } | null>(null);

  const create = trpc.departments.create.useMutation({
    onSuccess: () => {
      utils.departments.list.invalidate();
      setEditing(null);
      toast({ title: "Department created" });
    },
    onError: (err) => {
      toast({ title: "Create failed", description: err.message, variant: "destructive" });
    },
  });

  const update = trpc.departments.update.useMutation({
    onSuccess: () => {
      utils.departments.list.invalidate();
      setEditing(null);
      toast({ title: "Department updated" });
    },
    onError: (err) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const remove = trpc.departments.delete.useMutation({
    onSuccess: () => {
      utils.departments.list.invalidate();
      toast({ title: "Department deleted" });
    },
    onError: (err) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  const csvImport = trpc.departments.csvImport.useMutation({
    onSuccess: (result) => {
      utils.departments.list.invalidate();
      setCsvOpen(false);
      setCsvText("");
      toast({ title: `Imported ${result.imported} departments` });
    },
    onError: (err) => {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    },
  });

  const regenToken = trpc.departments.regenerateDeviceToken.useMutation({
    onSuccess: (result) => {
      utils.departments.list.invalidate();
      setTokenDisplay({ id: result.id, token: result.device_binding_token });
    },
    onError: (err) => {
      toast({ title: "Token rotation failed", description: err.message, variant: "destructive" });
    },
  });

  function openNew(): void {
    setEditing({ id: null });
    setForm(EMPTY_FORM);
  }

  function openEdit(d: NonNullable<typeof list.data>[number]): void {
    setEditing({ id: d.id });
    setForm({
      name: d.name,
      description: d.description ?? "",
      group_label: d.group_label ?? "",
      sort_order: String(d.sort_order),
      auto_answer_enabled: d.auto_answer_enabled,
    });
  }

  function submitForm(e: React.FormEvent): void {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() === "" ? null : form.description.trim(),
      group_label: form.group_label.trim() === "" ? null : form.group_label.trim(),
      sort_order: Number(form.sort_order) || 0,
      auto_answer_enabled: form.auto_answer_enabled,
    };
    if (editing?.id) {
      update.mutate({ id: editing.id, data: payload });
    } else {
      create.mutate(payload);
    }
  }

  function submitCsv(): void {
    const rows = parseCsv(csvText)
      .map((row) => ({
        name: (row.name ?? "").trim(),
        description:
          row.description !== undefined && row.description !== ""
            ? row.description
            : null,
        group_label:
          row.group_label !== undefined && row.group_label !== ""
            ? row.group_label
            : null,
        sort_order: row.sort_order ? Number(row.sort_order) : 0,
        auto_answer_enabled:
          (row.auto_answer_enabled ?? "").toLowerCase() === "true",
      }))
      .filter((r) => r.name.length > 0);
    if (rows.length === 0) {
      toast({
        title: "No valid rows",
        description: "CSV must include a 'name' column.",
        variant: "destructive",
      });
      return;
    }
    csvImport.mutate({ rows });
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Departments</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Speed-dial destinations for your team. CSV-importable.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCsvOpen(true)}>
            Import CSV
          </Button>
          <Button onClick={openNew}>New department</Button>
        </div>
      </header>

      <Card>
        <CardContent className="p-0">
          {list.isLoading && (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          )}
          {list.data?.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground">
              No departments yet. Create one or import a CSV.
            </p>
          )}
          {list.data && list.data.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead className="text-center">Order</TableHead>
                  <TableHead>Auto-answer</TableHead>
                  <TableHead>Device token</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell>
                      {d.group_label ? (
                        <Badge variant="secondary">{d.group_label}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">{d.sort_order}</TableCell>
                    <TableCell>
                      {d.auto_answer_enabled ? (
                        <Badge variant="success">Enabled</Badge>
                      ) : (
                        <Badge variant="outline">Off</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {d.device_binding_token ? (
                        <span className="font-mono text-xs text-muted-foreground">
                          {d.device_binding_token.slice(0, 12)}…
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => regenToken.mutate({ id: d.id })}
                          disabled={regenToken.isPending}
                        >
                          {d.device_binding_token ? "Rotate token" : "Bind device"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(d)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm(`Delete "${d.name}"?`)) {
                              remove.mutate({ id: d.id });
                            }
                          }}
                          disabled={remove.isPending}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create / edit dialog */}
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing?.id ? "Edit department" : "New department"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={submitForm} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="group_label">Group (optional)</Label>
              <Input
                id="group_label"
                value={form.group_label}
                onChange={(e) => setForm({ ...form, group_label: e.target.value })}
                placeholder="e.g. Front Office"
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sort_order">Sort order</Label>
              <Input
                id="sort_order"
                type="number"
                min={0}
                max={10000}
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="auto_answer"
                type="checkbox"
                checked={form.auto_answer_enabled}
                onChange={(e) =>
                  setForm({ ...form, auto_answer_enabled: e.target.checked })
                }
                className="h-4 w-4 rounded border-input"
              />
              <Label htmlFor="auto_answer">Auto-answer incoming calls</Label>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={create.isPending || update.isPending}
              >
                {editing?.id ? "Save" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* CSV import dialog */}
      <Dialog open={csvOpen} onOpenChange={setCsvOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import departments from CSV</DialogTitle>
            <DialogDescription>
              Paste CSV with header row:{" "}
              <code className="rounded bg-muted px-1 font-mono text-xs">
                name,description,group_label,sort_order,auto_answer_enabled
              </code>
              . Max 500 rows.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={10}
            placeholder="name,description,group_label,sort_order,auto_answer_enabled&#10;Reception,,Front Office,0,false&#10;Pharmacy,,Clinical,1,true"
            className="font-mono text-xs"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCsvOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitCsv}
              disabled={csvImport.isPending || csvText.trim().length === 0}
            >
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Token display dialog — shown once after rotation */}
      <Dialog
        open={tokenDisplay !== null}
        onOpenChange={(open) => !open && setTokenDisplay(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Device binding token</DialogTitle>
            <DialogDescription>
              Copy this token now — it will not be shown again. Enter it on the
              device you want to bind to this department.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/40 p-3">
            <code className="block break-all font-mono text-xs">
              {tokenDisplay?.token}
            </code>
          </div>
          <DialogFooter>
            <Button
              onClick={async () => {
                if (tokenDisplay) {
                  await navigator.clipboard.writeText(tokenDisplay.token);
                  toast({ title: "Token copied" });
                }
              }}
            >
              Copy to clipboard
            </Button>
            <Button variant="outline" onClick={() => setTokenDisplay(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
