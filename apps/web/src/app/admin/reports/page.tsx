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
  triggerBlobDownload(filename, blob);
}

function triggerPdfDownload(filename: string, base64: string): void {
  // atob → binary string → Uint8Array → Blob. Buffer.from would need a
  // polyfill not bundled by webpack in client builds.
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: "application/pdf" });
  triggerBlobDownload(filename, blob);
}

function triggerBlobDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Plain factory (not a hook — no `use` prefix). Returns a toast-success
// callback bound to a human-readable label. Pure function — safe to call
// inside event handlers and React effect callbacks.
function makeSuccessToast(label: string) {
  return (rowCount: number) => {
    toast({
      title: "Export complete",
      description: `${rowCount} ${label} row${rowCount === 1 ? "" : "s"} exported.`,
    });
  };
}

function showFailureToast(err: { message: string }): void {
  toast({
    title: "Export failed",
    description: err.message,
    variant: "destructive",
  });
}

export default function AdminReportsPage(): JSX.Element {
  const [startDate, setStartDate] = useState(isoDaysAgo(30));
  const [endDate, setEndDate] = useState(isoToday());

  const callLogsCsv = trpc.admin.reports.exportCallLogsCsv.useMutation({
    onSuccess: (result) => {
      triggerCsvDownload(result.filename, result.content);
      makeSuccessToast("call log")(result.row_count);
    },
    onError: showFailureToast,
  });
  const callLogsPdf = trpc.admin.reports.exportCallLogsPdf.useMutation({
    onSuccess: (result) => {
      triggerPdfDownload(result.filename, result.contentBase64);
      makeSuccessToast("call log")(result.row_count);
    },
    onError: showFailureToast,
  });
  const usageCsv = trpc.admin.reports.exportUsageSummaryCsv.useMutation({
    onSuccess: (result) => {
      triggerCsvDownload(result.filename, result.content);
      makeSuccessToast("usage summary")(result.row_count);
    },
    onError: showFailureToast,
  });
  const usagePdf = trpc.admin.reports.exportUsageSummaryPdf.useMutation({
    onSuccess: (result) => {
      triggerPdfDownload(result.filename, result.contentBase64);
      makeSuccessToast("usage summary")(result.row_count);
    },
    onError: showFailureToast,
  });
  const deptCsv = trpc.admin.reports.exportDeptActivityCsv.useMutation({
    onSuccess: (result) => {
      triggerCsvDownload(result.filename, result.content);
      makeSuccessToast("department activity")(result.row_count);
    },
    onError: showFailureToast,
  });
  const deptPdf = trpc.admin.reports.exportDeptActivityPdf.useMutation({
    onSuccess: (result) => {
      triggerPdfDownload(result.filename, result.contentBase64);
      makeSuccessToast("department activity")(result.row_count);
    },
    onError: showFailureToast,
  });

  const anyPending =
    callLogsCsv.isPending ||
    callLogsPdf.isPending ||
    usageCsv.isPending ||
    usagePdf.isPending ||
    deptCsv.isPending ||
    deptPdf.isPending;

  function rangeInput() {
    // input type=date returns YYYY-MM-DD at midnight UTC. Use end-of-day for
    // the upper bound so same-day exports include today's records.
    return {
      start: new Date(`${startDate}T00:00:00.000Z`),
      end: new Date(`${endDate}T23:59:59.999Z`),
    };
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Export call activity, daily usage, and department performance as CSV
          or PDF for offline analysis.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Date range</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid max-w-md grid-cols-2 gap-3">
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
          <p className="mt-3 text-xs text-muted-foreground">
            Maximum range: 366 days. Call-log exports are capped at 10,000
            rows.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Call detail records</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            Per-call rows: timestamps, duration, type, status, caller and
            recipient department.
          </p>
          <div className="flex gap-2">
            <Button
              onClick={() => callLogsCsv.mutate(rangeInput())}
              disabled={anyPending}
            >
              {callLogsCsv.isPending ? "Generating…" : "Download CSV"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => callLogsPdf.mutate(rangeInput())}
              disabled={anyPending}
            >
              {callLogsPdf.isPending ? "Generating…" : "Download PDF"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usage summary</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            Per-day rollup: meetings, recording minutes, active hosts.
          </p>
          <div className="flex gap-2">
            <Button
              onClick={() => usageCsv.mutate(rangeInput())}
              disabled={anyPending}
            >
              {usageCsv.isPending ? "Generating…" : "Download CSV"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => usagePdf.mutate(rangeInput())}
              disabled={anyPending}
            >
              {usagePdf.isPending ? "Generating…" : "Download PDF"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Department activity</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            Per-department: calls received, completed, completion rate, and
            average call duration.
          </p>
          <div className="flex gap-2">
            <Button
              onClick={() => deptCsv.mutate(rangeInput())}
              disabled={anyPending}
            >
              {deptCsv.isPending ? "Generating…" : "Download CSV"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => deptPdf.mutate(rangeInput())}
              disabled={anyPending}
            >
              {deptPdf.isPending ? "Generating…" : "Download PDF"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
