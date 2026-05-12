import { z } from 'zod';

export const InvoiceStatusSchema = z.enum(['paid', 'pending', 'failed', 'refunded']);
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;

export const InvoiceSchema = z.object({
  id: z.string().cuid2(),
  organization_id: z.string().cuid2(),
  subscription_id: z.string().cuid2(),
  xendit_invoice_id: z.string().min(1),
  amount_cents: z.number().int().nonnegative(),
  currency: z.string().length(3).default('PHP'),
  status: InvoiceStatusSchema,
  issued_at: z.coerce.date(),
  paid_at: z.coerce.date().nullable(),
  pdf_url: z.string().url().nullable(),
});
export type Invoice = z.infer<typeof InvoiceSchema>;

export const InvoiceCreateInputSchema = InvoiceSchema.omit({
  id: true,
});
export type InvoiceCreateInput = z.infer<typeof InvoiceCreateInputSchema>;

export const InvoiceUpdateInputSchema = InvoiceCreateInputSchema.partial();
export type InvoiceUpdateInput = z.infer<typeof InvoiceUpdateInputSchema>;
