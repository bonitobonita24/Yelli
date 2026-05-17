"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@yelli/ui/select";
import { toast } from "@yelli/ui/use-toast";
import { useMemo } from "react";

import { trpc } from "@/lib/trpc/react";

export interface DepartmentUserPickerUser {
  id: string;
  display_name: string;
}

interface DepartmentUserPickerProps {
  departmentId: string;
  currentUserId: string | null;
  /** Active users only — filtered by the parent before passing in. */
  users: readonly DepartmentUserPickerUser[];
  /** Optional hook (e.g. for parent-managed query invalidation). */
  onSaved?: () => void;
}

const CLEAR_VALUE = "__clear__";
const UNASSIGNED_VALUE = "__unassigned__";

/**
 * Inline binding picker for a single department row in /admin/departments.
 *
 * Why a separate component (not inline in page.tsx):
 *   Each row needs its own useMutation state (isPending, error). Inlining
 *   would require a hook-per-row inside .map() (illegal). Keeps page.tsx
 *   from growing further (already 462 lines).
 *
 * Why the parent filters to active users:
 *   The parent already has the admin.users.list query data; filtering once
 *   at the parent avoids duplicating the filter in every row.
 *
 * Edge case — currentUserId points to an inactive user:
 *   The user won't appear in the `users` list. The Select trigger shows
 *   "(deactivated)" cosmetically; admin can pick a new user or clear the
 *   binding to resolve.
 */
export function DepartmentUserPicker({
  departmentId,
  currentUserId,
  users,
  onSaved,
}: DepartmentUserPickerProps): JSX.Element {
  const setDefaultUser = trpc.departments.setDefaultUser.useMutation({
    onSuccess: () => {
      toast({ title: "Default user updated" });
      onSaved?.();
    },
    onError: (err) => {
      toast({
        title: "Update failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const currentUser = useMemo(
    () => users.find((u) => u.id === currentUserId) ?? null,
    [users, currentUserId],
  );

  const triggerValue =
    currentUserId === null
      ? UNASSIGNED_VALUE
      : currentUser !== null
        ? currentUserId
        : UNASSIGNED_VALUE; // deactivated user — render as unassigned cosmetically

  const triggerLabel =
    currentUserId === null
      ? "Unassigned"
      : currentUser !== null
        ? currentUser.display_name
        : "(deactivated)";

  function handleChange(value: string): void {
    if (value === UNASSIGNED_VALUE) return; // no-op — trigger placeholder
    const nextUserId = value === CLEAR_VALUE ? null : value;
    if (nextUserId === currentUserId) return; // no-op — same value
    setDefaultUser.mutate({ departmentId, userId: nextUserId });
  }

  return (
    <Select
      value={triggerValue}
      onValueChange={handleChange}
      disabled={setDefaultUser.isPending || users.length === 0}
    >
      <SelectTrigger className="h-8 w-44 text-sm">
        <SelectValue placeholder="Unassigned">{triggerLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {users.map((u) => (
          <SelectItem key={u.id} value={u.id}>
            {u.display_name}
          </SelectItem>
        ))}
        {currentUserId !== null && (
          <SelectItem
            value={CLEAR_VALUE}
            className="text-muted-foreground italic"
          >
            Clear binding
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
