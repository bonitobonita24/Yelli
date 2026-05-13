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

const registerSchema = z.object({
  displayName: z.string().trim().min(2, "Display name must be at least 2 characters."),
  email: z.string().email("Enter a valid email."),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters.")
    .refine((v) => /[A-Z]/.test(v), "Must include at least one uppercase letter.")
    .refine((v) => /[0-9]/.test(v), "Must include at least one number."),
  organizationName: z.string().trim().min(2, "Organization name must be at least 2 characters."),
  organizationSlug: z
    .string()
    .trim()
    .min(2, "Workspace slug must be at least 2 characters.")
    .regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and hyphens allowed."),
});

type RegisterInput = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const { toast } = useToast();
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  async function onSubmit(_values: RegisterInput) {
    if (!captchaToken) {
      toast({
        title: "Verification required",
        description: "Please complete the challenge.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    // TODO Part 5e: wire to trpc.auth.register.mutate({ ...values, turnstileToken: captchaToken })
    await new Promise((r) => setTimeout(r, 400));
    setSubmitting(false);
    toast({
      title: "Registration coming soon",
      description: "Part 5e wires this to tRPC.",
    });
  }

  return (
    <FormCard
      title="Create workspace"
      description="Set up your team in under a minute."
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

        <div className="space-y-2">
          <Label htmlFor="email">Work email</Label>
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
            autoComplete="new-password"
            {...register("password")}
          />
          {errors.password ? (
            <p className="text-xs text-destructive" role="alert">
              {errors.password.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="organizationName">Organization name</Label>
          <Input
            id="organizationName"
            type="text"
            autoComplete="organization"
            placeholder="Acme Inc."
            {...register("organizationName")}
          />
          {errors.organizationName ? (
            <p className="text-xs text-destructive" role="alert">
              {errors.organizationName.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="organizationSlug">Workspace slug</Label>
          <Input
            id="organizationSlug"
            type="text"
            autoComplete="off"
            placeholder="acme"
            {...register("organizationSlug")}
          />
          {errors.organizationSlug ? (
            <p className="text-xs text-destructive" role="alert">
              {errors.organizationSlug.message}
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
          {submitting ? "Creating workspace..." : "Create workspace"}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-foreground hover:underline underline-offset-4"
          >
            Sign in
          </Link>
        </p>
      </form>
    </FormCard>
  );
}
