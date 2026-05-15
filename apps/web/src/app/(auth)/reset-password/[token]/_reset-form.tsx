"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { resetPasswordInputSchema } from "@yelli/shared/schemas";
import {
  Button,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  toast,
} from "@yelli/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { trpc } from "@/lib/trpc/react";

import type { z } from "zod";

// Client-side form takes only the password — the token is bound from the URL
// param by the server page above and merged into the mutation payload.
const formSchema = resetPasswordInputSchema.pick({ password: true });
type FormValues = z.infer<typeof formSchema>;

interface ResetPasswordFormProps {
  token: string;
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const router = useRouter();
  const [doneOk, setDoneOk] = useState(false);
  const [linkDead, setLinkDead] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { password: "" },
  });

  const resetPassword = trpc.auth.resetPassword.useMutation({
    onSuccess: () => {
      setDoneOk(true);
      toast({
        title: "Password updated",
        description: "Sign in with your new password.",
      });
      router.push("/login");
    },
    onError: (error) => {
      // The router returns UNAUTHORIZED for unknown, expired, and consumed
      // tokens — all rendered the same way (no enumeration).
      if (error.data?.code === "UNAUTHORIZED") {
        setLinkDead(true);
        return;
      }
      toast({
        title: "Could not reset password",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  function onSubmit(values: FormValues) {
    resetPassword.mutate({ token, password: values.password });
  }

  if (linkDead) {
    return (
      <div className="space-y-4 py-2 text-center">
        <p className="text-sm text-muted-foreground">
          This reset link is invalid or has expired. Request a new one to
          continue.
        </p>
        <Link
          href="/forgot-password"
          className="text-sm text-foreground hover:underline underline-offset-4"
        >
          Send a new reset link
        </Link>
      </div>
    );
  }

  const isPending = resetPassword.isPending || doneOk;

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  autoComplete="new-password"
                  disabled={isPending}
                  {...field}
                />
              </FormControl>
              <FormDescription>
                At least 12 characters, including an uppercase letter and a
                number.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "Updating..." : "Update password"}
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
    </Form>
  );
}
