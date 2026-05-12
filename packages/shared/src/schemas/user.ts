import { z } from 'zod';

export const UserRoleSchema = z.enum(['tenant_admin', 'host', 'participant']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserStatusSchema = z.enum(['active', 'inactive']);
export type UserStatus = z.infer<typeof UserStatusSchema>;

export const UserSchema = z.object({
  id: z.string().cuid2(),
  organization_id: z.string().cuid2(),
  email: z.string().email(),
  password_hash: z.string(),
  display_name: z.string().min(1).max(200),
  role: UserRoleSchema,
  is_super_admin: z.boolean().default(false),
  avatar_url: z.string().url().nullable(),
  status: UserStatusSchema,
  last_seen_at: z.coerce.date().nullable(),
  security_version: z.number().int().default(0),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});
export type User = z.infer<typeof UserSchema>;

export const UserCreateInputSchema = UserSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
  avatar_url: true,
  last_seen_at: true,
}).extend({
  avatar_url: z.string().url().nullable().optional(),
  last_seen_at: z.coerce.date().nullable().optional(),
});
export type UserCreateInput = z.infer<typeof UserCreateInputSchema>;

export const UserUpdateInputSchema = UserCreateInputSchema.partial();
export type UserUpdateInput = z.infer<typeof UserUpdateInputSchema>;
