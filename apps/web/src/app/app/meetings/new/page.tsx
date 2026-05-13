import { redirect } from "next/navigation";

import { auth } from "@/server/auth";

import { MeetingForm } from "./_meeting-form";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "New Meeting — Yelli",
};

export default async function NewMeetingPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        New Meeting
      </h1>
      <MeetingForm />
    </main>
  );
}
