"use client";

import { cn } from "@yelli/ui";
import { useRouter } from "next/navigation";

import { usePresence } from "@/lib/presence/use-presence";

import { SpeedDialButton } from "./speed-dial-button";

interface Department {
  id: string;
  name: string;
  description: string | null;
  group_label: string | null;
  sort_order: number;
  auto_answer_enabled: boolean;
}

interface SpeedDialGridProps {
  departments: Department[];
  userRole: "tenant_admin" | "host" | "participant";
}

function getGridCols(count: number): string {
  if (count <= 4) return "grid-cols-2";
  if (count <= 9) return "grid-cols-3";
  if (count <= 16) return "grid-cols-4";
  return "grid-cols-5";
}

export function SpeedDialGrid({ departments, userRole }: SpeedDialGridProps) {
  const router = useRouter();
  const ids = departments.map((d) => d.id);
  const presence = usePresence(ids);

  function handleCall(id: string) {
    router.push(`/app/call/new?recipient=${id}`);
  }

  if (departments.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-muted-foreground">No departments configured yet.</p>
        {userRole === "tenant_admin" && (
          <a
            href="/app/settings/departments/new"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Add your first department →
          </a>
        )}
      </div>
    );
  }

  // Group departments by group_label (null/empty → "Other")
  const grouped = new Map<string, Department[]>();
  for (const dept of departments) {
    const label = dept.group_label?.trim() !== "" && dept.group_label != null
      ? dept.group_label
      : "Other";
    const existing = grouped.get(label);
    if (existing !== undefined) {
      existing.push(dept);
    } else {
      grouped.set(label, [dept]);
    }
  }

  const gridCols = getGridCols(departments.length);

  return (
    <div className="space-y-8">
      {Array.from(grouped.entries()).map(([groupLabel, groupDepts]) => (
        <section key={groupLabel}>
          {grouped.size > 1 && (
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {groupLabel}
            </h2>
          )}
          <div className={cn("grid gap-3", gridCols)}>
            {groupDepts.map((dept) => (
              <SpeedDialButton
                key={dept.id}
                id={dept.id}
                name={dept.name}
                description={dept.description}
                presenceState={presence[dept.id] ?? "offline"}
                autoAnswer={dept.auto_answer_enabled}
                onCall={handleCall}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
