"use client";

import { Alert, AlertDescription, AlertTitle } from "@yelli/ui/alert";
import { Badge } from "@yelli/ui/badge";
import { Button } from "@yelli/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@yelli/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@yelli/ui/table";
import { toast } from "@yelli/ui/use-toast";

import { trpc } from "@/lib/trpc/react";

function formatCents(cents: number, currency: string): string {
  const amount = cents / 100;
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
  }).format(amount);
}

export default function AdminBillingPage(): JSX.Element {
  const subscription = trpc.billing.subscription.current.useQuery();
  const invoices = trpc.billing.invoices.list.useQuery();

  const checkout = trpc.billing.checkout.createSession.useMutation({
    onSuccess: (result) => {
      // Redirect to Xendit hosted checkout
      window.location.href = result.invoice_url;
    },
    onError: (err) => {
      toast({
        title: "Checkout failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // SERVICE_UNAVAILABLE = XENDIT_SECRET_KEY env unset on this deployment.
  // STATE.md parallel: matches the LiveKit 503 graceful-degradation pattern.
  const checkoutDisabled =
    checkout.error?.data?.code === "SERVICE_UNAVAILABLE" ||
    checkout.error?.data?.httpStatus === 503;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your plan and view invoice history.
        </p>
      </header>

      {checkoutDisabled && (
        <Alert variant="warning">
          <AlertTitle>Billing is not configured</AlertTitle>
          <AlertDescription>
            Payment provider credentials are not set on this deployment.
            Contact your administrator to enable plan upgrades.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Current plan</CardTitle>
        </CardHeader>
        <CardContent>
          {subscription.isLoading && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {subscription.data === null && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Free</Badge>
                <span className="text-sm text-muted-foreground">
                  No paid subscription yet
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Upgrade to remove call-duration limits, unlock recording, and
                add more participants per meeting.
              </p>
            </div>
          )}
          {subscription.data && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    subscription.data.plan_tier === "pro" ? "default" : "info"
                  }
                  className="capitalize"
                >
                  {subscription.data.plan_tier}
                </Badge>
                <span className="text-sm capitalize text-muted-foreground">
                  {subscription.data.status.replace("_", " ")}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Period:{" "}
                {new Date(
                  subscription.data.current_period_start,
                ).toLocaleDateString()}{" "}
                –{" "}
                {new Date(
                  subscription.data.current_period_end,
                ).toLocaleDateString()}
              </p>
              <p className="text-sm text-muted-foreground">
                Minutes used this period:{" "}
                <strong>{subscription.data.minutes_used_this_period}</strong>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upgrade</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border p-4">
              <h3 className="font-semibold">Pro</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Unlimited meeting length, up to 50 participants, recording.
              </p>
              <Button
                className="mt-4"
                onClick={() => checkout.mutate({ target_plan: "pro" })}
                disabled={
                  checkout.isPending ||
                  subscription.data?.plan_tier === "pro" ||
                  subscription.data?.plan_tier === "enterprise"
                }
              >
                Upgrade to Pro
              </Button>
            </div>
            <div className="rounded-lg border p-4">
              <h3 className="font-semibold">Enterprise</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Pro features + SSO, audit log export, dedicated support.
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => checkout.mutate({ target_plan: "enterprise" })}
                disabled={
                  checkout.isPending ||
                  subscription.data?.plan_tier === "enterprise"
                }
              >
                Upgrade to Enterprise
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoice history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {invoices.isLoading && (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          )}
          {invoices.data && invoices.data.items.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground">
              No invoices yet.
            </p>
          )}
          {invoices.data && invoices.data.items.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Issued</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">PDF</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.data.items.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>
                      {new Date(inv.issued_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatCents(inv.amount_cents, inv.currency)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          inv.status === "paid"
                            ? "success"
                            : inv.status === "pending"
                              ? "warning"
                              : inv.status === "failed"
                                ? "destructive"
                                : "secondary"
                        }
                        className="capitalize"
                      >
                        {inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {inv.pdf_url ? (
                        <a
                          href={inv.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-accent-hover underline-offset-4 hover:underline"
                        >
                          Download
                        </a>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
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
