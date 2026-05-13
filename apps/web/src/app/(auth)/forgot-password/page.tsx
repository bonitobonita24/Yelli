"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@yelli/ui/button";
import { Input } from "@yelli/ui/input";
import { Label } from "@yelli/ui/label";
import { useToast } from "@yelli/ui/use-toast";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";


import { TurnstileWidget } from "@/components/turnstile-widget";

import { FormCard } from "../_components/form-card";

const forgotSchema = z.object({
  email: z.string().email("Enter a valid email."),
});

type ForgotInput = z.infer<typeof forgotSchema>;

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotInput>({ resolver: zodResolver(forgotSchema) });

  async function onSubmit(_values: ForgotInput) {
    if (!captchaToken) {
      toast({
        title: "Verification required",
        description: "Please complete the challenge.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    // TODO Part 5e: wire to trpc.auth.requestPasswordReset.mutate({ email: values.email, turnstileToken: captchaToken })
    await new Promise((r) => setTimeout(r, 400));
    setSubmitting(false);
    // Generic response regardless of whether email exists — security.md §PRODUCTION ERROR HANDLING
    setSent(true);
  }

  return (
    <FormCard
      title="Forgot password?"
      description="We'll send a reset link to your email."
    >
      {sent ? (
        <div className="space-y-4 py-2 text-center">
          <p className="text-sm text-muted-foreground">
            If that email exists, we sent a reset link. Check your inbox.
          </p>
          <Link
            href="/login"
            className="text-sm text-foreground hover:underline underline-offset-4"
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              {...register("email")}
            />
            {errors.email ? (
              <p className="text-xs text-destructive" role="alert">
                {errors.email.message}
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
            {submitting ? "Sending..." : "Send reset link"}
          </Button>

          <p className="text-center text-sm">
            <Link
              href="/login"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Back to sign in
            </Link>
          </p>
        </form>
      )}
    </FormCard>
  );
}
