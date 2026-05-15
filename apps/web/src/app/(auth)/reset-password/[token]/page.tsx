import { FormCard } from "../../_components/form-card";

import { ResetPasswordForm } from "./_reset-form";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset password — Yelli",
};

interface ResetPasswordPageProps {
  params: Promise<{ token: string }>;
}

export default async function ResetPasswordPage({
  params,
}: ResetPasswordPageProps) {
  const { token } = await params;

  return (
    <FormCard
      title="Choose a new password"
      description="Set a new password to regain access to your account."
    >
      <ResetPasswordForm token={token} />
    </FormCard>
  );
}
