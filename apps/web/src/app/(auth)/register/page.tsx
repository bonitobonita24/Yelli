"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { registerInputSchema, type RegisterInput } from "@yelli/shared/schemas";
import { Button } from "@yelli/ui/button";
import { Input } from "@yelli/ui/input";
import { Label } from "@yelli/ui/label";
import { useToast } from "@yelli/ui/use-toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { TurnstileWidget } from "@/components/turnstile-widget";
import { trpc } from "@/lib/trpc/react";

import { FormCard } from "../_components/form-card";

// Client-side form schema = server schema minus turnstileToken (form handles that
// separately via the widget callback).
const registerSchema = registerInputSchema.omit({ turnstileToken: true });
type RegisterFormInput = Omit<RegisterInput, "turnstileToken">;

export default function RegisterPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormInput>({ resolver: zodResolver(registerSchema) });

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: ({ slug }) => {
      toast({
        title: "Workspace created",
        description: "Sign in to continue.",
      });
      router.push(`/login?org=${encodeURIComponent(slug)}`);
    },
    onError: (error) => {
      toast({
        title: "Could not create workspace",
        description: error.message,
        variant: "destructive",
      });
      setCaptchaToken(null);
    },
  });

  async function onSubmit(values: RegisterFormInput) {
    if (!captchaToken) {
      toast({
        title: "Verification required",
        description: "Please complete the challenge.",
        variant: "destructive",
      });
      return;
    }
    registerMutation.mutate({ ...values, turnstileToken: captchaToken });
  }

  const submitting = registerMutation.isPending;

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
