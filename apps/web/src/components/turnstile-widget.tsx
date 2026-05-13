"use client";

import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { useTheme } from "next-themes";
import { forwardRef, useRef } from "react";

import { clientEnv } from "@/env";

export type TurnstileWidgetProps = {
  onVerified: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  className?: string;
};

/**
 * Wraps Cloudflare Turnstile with next-themes awareness.
 * siteKey comes from clientEnv (NEXT_PUBLIC_) so it is never undefined at runtime.
 * Server-side validation of the returned token is REQUIRED — this widget alone provides no protection.
 */
export const TurnstileWidget = forwardRef<
  TurnstileInstance | undefined,
  TurnstileWidgetProps
>(function TurnstileWidget(
  { onVerified, onError, onExpire, className },
  externalRef,
) {
  const { resolvedTheme } = useTheme();
  const internalRef = useRef<TurnstileInstance | null>(null);

  const theme: "light" | "dark" | "auto" =
    resolvedTheme === "dark"
      ? "dark"
      : resolvedTheme === "light"
        ? "light"
        : "auto";

  return (
    <div className={className}>
      <Turnstile
        ref={(instance) => {
          internalRef.current = instance ?? null;
          if (typeof externalRef === "function") {
            externalRef(instance ?? undefined);
          } else if (externalRef) {
            externalRef.current = instance ?? undefined;
          }
        }}
        siteKey={clientEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
        options={{ theme, size: "normal", action: "submit" }}
        onSuccess={onVerified}
        onError={() => onError?.()}
        onExpire={() => onExpire?.()}
      />
    </div>
  );
});
