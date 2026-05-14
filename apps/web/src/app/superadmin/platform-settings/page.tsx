"use client";

import { Button } from "@yelli/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@yelli/ui/card";
import { Input } from "@yelli/ui/input";
import { Label } from "@yelli/ui/label";
import { toast } from "@yelli/ui/use-toast";
import { useEffect, useState } from "react";

import { trpc } from "@/lib/trpc/react";

interface FormValues {
  free_tier_group_call_limit_minutes: string;
  free_tier_max_participants: string;
  pro_tier_price_cents: string;
  enterprise_tier_price_cents: string;
  recording_storage_quota_gb: string;
}

const EMPTY: FormValues = {
  free_tier_group_call_limit_minutes: "",
  free_tier_max_participants: "",
  pro_tier_price_cents: "",
  enterprise_tier_price_cents: "",
  recording_storage_quota_gb: "",
};

/**
 * Platform-wide settings — singleton row id="singleton" in PlatformSettings.
 * Edits affect every tenant immediately. Only super-admins reach this page.
 */
export default function PlatformSettingsPage(): JSX.Element {
  const utils = trpc.useUtils();
  const settings = trpc.superadmin.platformSettings.get.useQuery();
  const [form, setForm] = useState<FormValues>(EMPTY);

  useEffect(() => {
    if (settings.data) {
      setForm({
        free_tier_group_call_limit_minutes: String(
          settings.data.free_tier_group_call_limit_minutes,
        ),
        free_tier_max_participants: String(
          settings.data.free_tier_max_participants,
        ),
        pro_tier_price_cents: String(settings.data.pro_tier_price_cents),
        enterprise_tier_price_cents: String(
          settings.data.enterprise_tier_price_cents,
        ),
        recording_storage_quota_gb: String(
          settings.data.recording_storage_quota_gb,
        ),
      });
    }
  }, [settings.data]);

  const update = trpc.superadmin.platformSettings.update.useMutation({
    onSuccess: () => {
      utils.superadmin.platformSettings.get.invalidate();
      toast({ title: "Platform settings saved" });
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
      free_tier_group_call_limit_minutes:
        Number(form.free_tier_group_call_limit_minutes) || undefined,
      free_tier_max_participants:
        Number(form.free_tier_max_participants) || undefined,
      pro_tier_price_cents: Number(form.pro_tier_price_cents) || undefined,
      enterprise_tier_price_cents:
        Number(form.enterprise_tier_price_cents) || undefined,
      recording_storage_quota_gb:
        Number(form.recording_storage_quota_gb) || undefined,
    });
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Platform settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Defaults applied to every tenant. Prices are in centavos (PHP × 100).
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Tier defaults</CardTitle>
        </CardHeader>
        <CardContent>
          {settings.isLoading && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {settings.data && (
            <form onSubmit={submit} className="max-w-md space-y-4">
              <div className="space-y-2">
                <Label htmlFor="free_min">
                  Free tier — group call minutes
                </Label>
                <Input
                  id="free_min"
                  type="number"
                  min={1}
                  max={1440}
                  value={form.free_tier_group_call_limit_minutes}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      free_tier_group_call_limit_minutes: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="free_max">Free tier — max participants</Label>
                <Input
                  id="free_max"
                  type="number"
                  min={2}
                  max={1000}
                  value={form.free_tier_max_participants}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      free_tier_max_participants: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pro_price">
                  Pro tier price (centavos / PHP × 100)
                </Label>
                <Input
                  id="pro_price"
                  type="number"
                  min={0}
                  max={100000000}
                  value={form.pro_tier_price_cents}
                  onChange={(e) =>
                    setForm({ ...form, pro_tier_price_cents: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ent_price">
                  Enterprise tier price (centavos)
                </Label>
                <Input
                  id="ent_price"
                  type="number"
                  min={0}
                  max={100000000}
                  value={form.enterprise_tier_price_cents}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      enterprise_tier_price_cents: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="storage">Recording storage quota (GB)</Label>
                <Input
                  id="storage"
                  type="number"
                  min={1}
                  max={100000}
                  value={form.recording_storage_quota_gb}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      recording_storage_quota_gb: e.target.value,
                    })
                  }
                />
              </div>
              <Button type="submit" disabled={update.isPending}>
                Save platform settings
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
