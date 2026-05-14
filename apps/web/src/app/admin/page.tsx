"use client";

import { Badge } from "@yelli/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@yelli/ui/card";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { trpc } from "@/lib/trpc/react";

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}): JSX.Element {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export default function AdminDashboardPage(): JSX.Element {
  const stats = trpc.admin.dashboard.stats.useQuery();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Organization activity over the last 30 days.
        </p>
      </header>

      {stats.isLoading && (
        <div className="text-sm text-muted-foreground">Loading…</div>
      )}

      {stats.error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load dashboard: {stats.error.message}
        </div>
      )}

      {stats.data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Departments"
              value={stats.data.departmentCount}
              hint="Speed-dial destinations"
            />
            <StatCard
              label="Active users"
              value={stats.data.activeUserCount}
              hint={`${stats.data.userCount} total`}
            />
            <StatCard
              label="Calls (30 days)"
              value={stats.data.callsLast30Days}
              hint={`${stats.data.completedCalls} completed · ${stats.data.missedCalls} missed`}
            />
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Plan
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-2">
                <Badge
                  variant={
                    stats.data.planTier === "free"
                      ? "secondary"
                      : stats.data.planTier === "pro"
                        ? "default"
                        : "info"
                  }
                  className="capitalize"
                >
                  {stats.data.planTier}
                </Badge>
                <span className="text-xs capitalize text-muted-foreground">
                  {stats.data.subscriptionStatus.replace("_", " ")}
                </span>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Call volume</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={stats.data.callsTimeSeries}
                    margin={{ top: 10, right: 12, left: -8, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="callFill" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor="hsl(var(--chart-1))"
                          stopOpacity={0.4}
                        />
                        <stop
                          offset="95%"
                          stopColor="hsl(var(--chart-1))"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      tickFormatter={(d: string) => d.slice(5)}
                      stroke="hsl(var(--border))"
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      stroke="hsl(var(--border))"
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="hsl(var(--chart-1))"
                      strokeWidth={2}
                      fill="url(#callFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
