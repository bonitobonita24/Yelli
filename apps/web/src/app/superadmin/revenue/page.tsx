"use client";

import { Button } from "@yelli/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@yelli/ui/card";
import { Input } from "@yelli/ui/input";
import { Label } from "@yelli/ui/label";
import { toast } from "@yelli/ui/use-toast";
import { useState } from "react";

import { trpc } from "@/lib/trpc/react";

/**
 * Super-admin revenue dashboard.
 * Backed by superadmin.revenue.* which uses platformPrisma — no L6 tenant
 * guard. Every export is audit-logged with PLATFORM:EXPORT_REVENUE_*.
 *
 * Per [[xendit-internal-id-in-api-wire]]: the underlying procedures use
 * explicit Prisma `select` clauses that EXCLUDE xendit_*_id columns from
 * both the Invoice and the nested Subscription. The leak guard is enforced
 * at the router layer; this page only renders what the server sends.
 */

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
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  triggerBlobDownload(filename, new Blob([bytes], { type: "application/pdf" }));
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

function notifySuccess(rowCount: number): void {
  toast({
    title: "Revenue export complete",
    description: `${rowCount} aggregated row${rowCount === 1 ? "" : "s"}.`,
  });
}

function notifyFailure(err: { message: string }): void {
  toast({
    title: "Export failed",
    description: err.message,
    variant: "destructive",
  });
}

export default function SuperAdminRevenuePage(): JSX.Element {
  const [startDate, setStartDate] = useState(isoDaysAgo(90));
  const [endDate, setEndDate] = useState(isoToday());

  const csv = trpc.superadmin.revenue.exportRevenueCsv.useMutation({
    onSuccess: (result) => {
      triggerCsvDownload(result.filename, result.content);
      notifySuccess(result.row_count);
    },
    onError: notifyFailure,
  });
  const pdf = trpc.superadmin.revenue.exportRevenuePdf.useMutation({
    onSuccess: (result) => {
      triggerPdfDownload(result.filename, result.contentBase64);
      notifySuccess(result.row_count);
    },
    onError: notifyFailure,
  });

  function rangeInput() {
    return {
      start: new Date(`${startDate}T00:00:00.000Z`),
      end: new Date(`${endDate}T23:59:59.999Z`),
    };
  }

  const pending = csv.isPending || pdf.isPending;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Revenue</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cross-tenant revenue rollup by period, plan tier, and payment method.
          Every export is logged in the platform audit trail.
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
            Maximum range: 366 days. Aggregation key is (period_month,
            plan_tier, payment_method).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Platform revenue summary</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            Columns: period_month, plan_tier, payment_method, invoice_count,
            paid_count, failed_count, refunded_count, paid_amount_php.
          </p>
          <div className="flex gap-2">
            <Button
              onClick={() => csv.mutate(rangeInput())}
              disabled={pending}
            >
              {csv.isPending ? "Generating…" : "Download CSV"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => pdf.mutate(rangeInput())}
              disabled={pending}
            >
              {pdf.isPending ? "Generating…" : "Download PDF"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
