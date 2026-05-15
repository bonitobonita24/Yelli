import { z } from "zod";

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
  password: z
    .string()
    .min(12, "Password must be at least 12 characters.")
    .refine((v) => /[A-Z]/.test(v), "Must include at least one uppercase letter.")
    .refine((v) => /[0-9]/.test(v), "Must include at least one number."),
  turnstileToken: z.string().min(1, "Captcha token is required."),
});

export type RegisterInput = z.infer<typeof registerInputSchema>;
