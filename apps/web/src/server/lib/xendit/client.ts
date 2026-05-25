/**
 * Xendit Invoice API thin client. Server-only — never import from a Client
 * Component or anywhere the bundle reaches the browser, because the secret
 * key auth header would leak.
 *
 * Extracted from apps/web/src/server/trpc/routers/billing.ts (Phase 8 Item 3a)
 * so the webhook worker (Item 3b) and any future Xendit caller can reuse the
 * same auth + error mapping.
 *
 * Location convention: anything under apps/web/src/server/** is server-only
 * by repository convention (matches apps/web/src/server/lib/rate-limit.ts and
 * apps/web/src/server/lib/sanitize.ts).
 */

import { TRPCError } from "@trpc/server";

import type { BillingCycle, XenditPaymentMethod } from "@yelli/shared";

/**
 * Subset of the Xendit Invoice API request body relevant to Yelli. Full API
 * docs: https://docs.xendit.co/apidocs (Invoice → Create).
 *
 * `amount` is in major units (PHP) per Xendit's API contract — never centavos.
 * The caller is responsible for converting from cents.
 */
export interface CreateXenditInvoiceParams {
  external_id: string;
  amount: number;
  currency: "PHP";
  payer_email: string | null;
  description: string;
  payment_methods?: XenditPaymentMethod[] | undefined;
  success_redirect_url?: string | undefined;
  failure_redirect_url?: string | undefined;
  invoice_duration?: number | undefined;
}

/**
 * Subset of the Xendit Invoice response relevant to Yelli. Other fields exist
 * but are not consumed by the app — keep this surface narrow to make Xendit
 * version drift surface as compile errors rather than silent shape changes.
 */
export interface XenditInvoiceResponse {
  id: string;
  invoice_url: string;
  status: string;
  amount: number;
  currency: string;
  external_id: string;
}

/**
 * Calls the Xendit Invoice API with Basic-auth using the secret key. Maps
 * network and HTTP errors to typed TRPCError codes the caller can re-throw
 * directly. Never includes Xendit response bodies in the error message —
 * those can contain internal IDs (security.md production error handling).
 */
export async function createXenditInvoice(
  secretKey: string,
  params: CreateXenditInvoiceParams,
): Promise<XenditInvoiceResponse> {
  const authHeader = `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;

  let res: Response;
  try {
    res = await fetch("https://api.xendit.co/v2/invoices", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify(params),
    });
  } catch {
    // Network-level failure (DNS / TLS / timeout).
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: "Payment provider unreachable. Please try again.",
    });
  }

  if (!res.ok) {
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: "Payment provider rejected the request. Please try again.",
    });
  }

  try {
    return (await res.json()) as XenditInvoiceResponse;
  } catch {
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: "Payment provider returned an unexpected response.",
    });
  }
}

/**
 * Annual cycle = 10× the monthly price (PRODUCT.md L104: "annual = ~2 months
 * free"). Pure helper exposed for unit tests and the upgrade UI to render
 * effective monthly rates.
 */
export function computeCycleAmount(
  monthlyAmountCents: number,
  cycle: BillingCycle,
): number {
  return cycle === "annual" ? monthlyAmountCents * 10 : monthlyAmountCents;
}
