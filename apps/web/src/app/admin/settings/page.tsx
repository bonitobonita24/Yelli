"use client";

import { Badge } from "@yelli/ui/badge";
import { Button } from "@yelli/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@yelli/ui/card";
import { Input } from "@yelli/ui/input";
import { Label } from "@yelli/ui/label";
import { toast } from "@yelli/ui/use-toast";
import { useEffect, useState } from "react";

import { trpc } from "@/lib/trpc/react";

export default function AdminSettingsPage(): JSX.Element {
  const utils = trpc.useUtils();
  const settings = trpc.admin.settings.get.useQuery();

  const [name, setName] = useState("");
  const [billingEmail, setBillingEmail] = useState("");

  // Hydrate form on first load
  useEffect(() => {
    if (settings.data) {
      setName(settings.data.name);
      setBillingEmail(settings.data.billing_email);
    }
  }, [settings.data]);

  const update = trpc.admin.settings.update.useMutation({
    onSuccess: () => {
      utils.admin.settings.get.invalidate();
      toast({ title: "Settings saved" });
    },
    onError: (err) => {
      toast({
        title: "Save failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  function submit(e: React.FormEvent): void {
    e.preventDefault();
    update.mutate({
      name: name.trim(),
      billing_email: billingEmail.trim().toLowerCase(),
    });
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Organization profile and billing contact.
        </p>
      </header>

      {settings.isLoading && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      {settings.data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Organization</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="max-w-md space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Organization name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={200}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slug">URL slug</Label>
                  <Input
                    id="slug"
                    value={settings.data.slug}
                    disabled
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    URL slug is locked — contact support to change it.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="billing_email">Billing email</Label>
                  <Input
                    id="billing_email"
                    type="email"
                    value={billingEmail}
                    onChange={(e) => setBillingEmail(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Invoices and billing notifications are sent here.
                  </p>
                </div>
                <Button type="submit" disabled={update.isPending}>
                  Save changes
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Plan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    settings.data.plan_tier === "free"
                      ? "secondary"
                      : settings.data.plan_tier === "pro"
                        ? "default"
                        : "info"
                  }
                  className="capitalize"
                >
                  {settings.data.plan_tier}
                </Badge>
                <span className="text-sm capitalize text-muted-foreground">
                  {settings.data.subscription_status.replace("_", " ")}
                </span>
              </div>
              {settings.data.suspended_at && (
                <p className="text-sm text-destructive">
                  Organization is suspended (as of{" "}
                  {new Date(settings.data.suspended_at).toLocaleDateString()}).
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Manage your plan and view invoices on the{" "}
                <a
                  href="/admin/billing"
                  className="font-medium text-accent-hover underline-offset-4 hover:underline"
                >
                  Billing
                </a>{" "}
                page.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
