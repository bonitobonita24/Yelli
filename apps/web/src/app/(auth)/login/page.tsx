"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@yelli/ui/button";
import { Input } from "@yelli/ui/input";
import { Label } from "@yelli/ui/label";
import { useToast } from "@yelli/ui/use-toast";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";


import { TurnstileWidget } from "@/components/turnstile-widget";

import { FormCard } from "../_components/form-card";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email."),
  password: z.string().min(1, "Password is required."),
  organizationSlug: z.string().trim().optional().or(z.literal("")),
});

type LoginInput = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/app";
  const { toast } = useToast();

  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginInput) {
    if (!captchaToken) {
      toast({
        title: "Verification required",
        description: "Please complete the challenge.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    const result = await signIn("credentials", {
      email: values.email,
      password: values.password,
      organizationSlug: values.organizationSlug || undefined,
      // Turnstile token forwarded to credentials provider; server verifies in Part 5e
      turnstileToken: captchaToken,
      redirect: false,
      callbackUrl,
    });
    setSubmitting(false);
    if (!result || result.error) {
      // Generic message — never reveal which field failed (security.md §PRODUCTION ERROR HANDLING)
      toast({
        title: "Couldn't sign you in",
        description: "Check your details and try again.",
        variant: "destructive",
      });
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <FormCard title="Sign in" description="Welcome back. Sign in to your workspace.">
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

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...register("password")}
          />
          {errors.password ? (
            <p className="text-xs text-destructive" role="alert">
              {errors.password.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="organizationSlug" className="flex items-center justify-between">
            <span>Workspace</span>
            <span className="text-xs text-muted-foreground">Optional</span>
          </Label>
          <Input
            id="organizationSlug"
            type="text"
            autoComplete="organization"
            placeholder="e.g. acme"
            {...register("organizationSlug")}
          />
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
          {submitting ? "Signing in..." : "Sign in"}
        </Button>

        <div className="flex items-center justify-between text-sm">
          <Link
            href="/forgot-password"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Forgot password?
          </Link>
          <Link
            href="/register"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Create workspace
          </Link>
        </div>
      </form>
    </FormCard>
  );
}
