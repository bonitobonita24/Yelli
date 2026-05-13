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

import { FormCard } from "../../_components/form-card";

const joinSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Enter your name.")
    .max(60, "Name must be 60 characters or fewer."),
});

type JoinInput = z.infer<typeof joinSchema>;

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
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<JoinInput>({ resolver: zodResolver(joinSchema) });

  async function onSubmit(values: JoinInput) {
    if (!captchaToken) {
      toast({
        title: "Verification required",
        description: "Please complete the challenge.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    // TODO Part 5d: trpc.meeting.exchangeGuestToken.mutate({ token, displayName: values.displayName, turnstileToken: captchaToken })
    //              returns { meetingId, guestSessionToken }; redirect to /app/meeting/[meetingId]
    // Temporary routing until Part 5d wires the token exchange
    const encoded = encodeURIComponent(values.displayName);
    router.push(`/app/meeting/${token}?guest=1&name=${encoded}`);
  }

  return (
    <FormCard title="Join meeting" description="Enter your name to join as a guest.">
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
