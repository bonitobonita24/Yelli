import { z } from 'zod';

export const DepartmentSchema = z.object({
  id: z.string().cuid2(),
  organization_id: z.string().cuid2(),
  name: z.string().min(1).max(200),
  description: z.string().nullable(),
  group_label: z.string().nullable(),
  sort_order: z.number().int(),
  device_binding_token: z.string().nullable(),
  auto_answer_enabled: z.boolean().default(false),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});
export type Department = z.infer<typeof DepartmentSchema>;

export const DepartmentCreateInputSchema = DepartmentSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
  description: true,
  group_label: true,
  device_binding_token: true,
}).extend({
  description: z.string().nullable().optional(),
  group_label: z.string().nullable().optional(),
  device_binding_token: z.string().nullable().optional(),
});
export type DepartmentCreateInput = z.infer<typeof DepartmentCreateInputSchema>;

export const DepartmentUpdateInputSchema = DepartmentCreateInputSchema.partial();
export type DepartmentUpdateInput = z.infer<typeof DepartmentUpdateInputSchema>;
