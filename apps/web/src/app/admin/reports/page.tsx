"use client";

import { Button } from "@yelli/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@yelli/ui/card";
import { Input } from "@yelli/ui/input";
import { Label } from "@yelli/ui/label";
import { toast } from "@yelli/ui/use-toast";
import { useState } from "react";

import { trpc } from "@/lib/trpc/react";

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function triggerCsvDownload(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function AdminReportsPage(): JSX.Element {
  const [startDate, setStartDate] = useState(isoDaysAgo(30));
  const [endDate, setEndDate] = useState(isoToday());

  const exportMutation = trpc.admin.reports.exportCallLogsCsv.useMutation({
    onSuccess: (result) => {
      triggerCsvDownload(result.filename, result.content);
      toast({
        title: "Export complete",
        description: `${result.row_count} call logs exported.`,
      });
    },
    onError: (err) => {
      toast({
        title: "Export failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  function handleExport(): void {
    // Coerce to Date — input type=date returns YYYY-MM-DD at midnight UTC.
    // Use end-of-day for the upper bound so same-day exports include today's calls.
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T23:59:59.999Z`);
    exportMutation.mutate({ start, end });
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Export call activity as CSV for offline analysis.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Call logs (CSV)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid max-w-md gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="start">Start</Label>
                <Input
                  id="start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  max={endDate}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end">End</Label>
                <Input
                  id="end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate}
                  max={isoToday()}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Maximum range: 365 days. Output is capped at 10,000 rows per export.
            </p>
            <div>
              <Button
                onClick={handleExport}
                disabled={
                  exportMutation.isPending ||
                  startDate === "" ||
                  endDate === ""
                }
              >
                {exportMutation.isPending
                  ? "Generating…"
                  : "Download CSV"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Other reports</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            User-activity, recording-usage, and PDF-formatted reports are
            scheduled for a future release. Reach out to support for custom
            extracts.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
