import { z } from "zod";

/**
 * Reusable password rules. Used by register + password reset. Keeping a single
 * source prevents the two flows drifting on min length / character classes.
 */
export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters.")
  .refine((v) => /[A-Z]/.test(v), "Must include at least one uppercase letter.")
  .refine((v) => /[0-9]/.test(v), "Must include at least one number.");

export const registerInputSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "Display name must be at least 2 characters."),
  organizationName: z
    .string()
    .trim()
    .min(2, "Organization name must be at least 2 characters."),
  organizationSlug: z
    .string()
    .trim()
    .min(2, "Workspace slug must be at least 2 characters.")
    .regex(
      /^[a-z0-9-]+$/,
      "Only lowercase letters, numbers, and hyphens allowed.",
    ),
  email: z.string().email("Enter a valid email."),
  password: passwordSchema,
  turnstileToken: z.string().min(1, "Captcha token is required."),
});

export type RegisterInput = z.infer<typeof registerInputSchema>;

export const requestPasswordResetInputSchema = z
  .object({
    email: z.string().email("Enter a valid email."),
    turnstileToken: z.string().min(1, "Captcha token is required."),
  })
  .strict();

export type RequestPasswordResetInput = z.infer<
  typeof requestPasswordResetInputSchema
>;

export const resetPasswordInputSchema = z
  .object({
    token: z.string().min(1, "Reset token is required."),
    password: passwordSchema,
  })
  .strict();

export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>;
