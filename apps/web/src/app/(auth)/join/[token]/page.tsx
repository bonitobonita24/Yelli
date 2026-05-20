"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@yelli/ui/button";
import { Input } from "@yelli/ui/input";
import { Label } from "@yelli/ui/label";
import { useToast } from "@yelli/ui/use-toast";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { TurnstileWidget } from "@/components/turnstile-widget";
import { trpc } from "@/lib/trpc/react";

import { FormCard } from "../../_components/form-card";

const joinSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Enter your name.")
    .max(60, "Name must be 60 characters or fewer."),
});

type JoinInput = z.infer<typeof joinSchema>;

// SessionStorage key the meeting page reads to pick up the guest's LiveKit
// JWT after redirect. Per-meeting so multiple tabs don't clobber each other.
function guestSessionStorageKey(meetingId: string): string {
  return `yelli:guest-meeting:${meetingId}`;
}

export default function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  // Next.js 15 async params — unwrap with React.use()
  const { token } = use(params);
  const router = useRouter();
  const { toast } = useToast();

  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<JoinInput>({ resolver: zodResolver(joinSchema) });

  const exchangeMutation = trpc.meetings.exchangeGuestToken.useMutation({
    onSuccess: ({ meetingId, livekitJwt, wsUrl, roomName }, variables) => {
      // Persist the JWT + room metadata for the meeting page to consume.
      // sessionStorage is per-tab and cleared on close — appropriate for an
      // ephemeral guest credential. The JWT itself has a 6h server-side cap.
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(
          guestSessionStorageKey(meetingId),
          JSON.stringify({
            livekitJwt,
            wsUrl,
            roomName,
            displayName: variables.displayName,
          }),
        );
      }
      router.push(`/app/meeting/${meetingId}?guest=1`);
    },
    onError: (error) => {
      toast({
        title: "Could not join meeting",
        description: error.message,
        variant: "destructive",
      });
      // Reset captcha — each Turnstile token is single-use.
      setCaptchaToken(null);
    },
  });

  function onSubmit(values: JoinInput) {
    if (!captchaToken) {
      toast({
        title: "Verification required",
        description: "Please complete the challenge.",
        variant: "destructive",
      });
      return;
    }
    exchangeMutation.mutate({
      token,
      displayName: values.displayName,
      turnstileToken: captchaToken,
    });
  }

  const submitting = exchangeMutation.isPending;

  return (
    <FormCard
      title="Join meeting"
      description="Enter your name to join as a guest."
    >
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-2">
          <Label htmlFor="displayName">Your name</Label>
          <Input
            id="displayName"
            type="text"
            autoComplete="name"
            placeholder="Jane Smith"
            {...register("displayName")}
          />
          {errors.displayName ? (
            <p className="text-xs text-destructive" role="alert">
              {errors.displayName.message}
            </p>
          ) : null}
        </div>

        <TurnstileWidget
          onVerified={setCaptchaToken}
          onExpire={() => setCaptchaToken(null)}
        />

        <Button
          type="submit"
          className="w-full"
          disabled={submitting || !captchaToken}
        >
          {submitting ? "Joining..." : "Join meeting"}
        </Button>
      </form>
    </FormCard>
  );
}
