"use client";

import { zodResolver } from "@hookform/resolvers/zod";
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
  Label,
  Textarea,
  toast,
} from "@yelli/ui";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { trpc } from "@/lib/trpc/react";

// Local form shape: scheduled_at is the datetime-local string (or "") emitted
// by <input type="datetime-local">. We translate to Date | null at submit time
// before invoking the tRPC mutation, which validates against
// MeetingCreateClientInputSchema (the wire-level source of truth).
const formSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(300),
    description: z.string().max(2000).default(""),
    scheduled_at: z.string().default(""),
    recording_enabled: z.boolean().default(false),
    lobby_enabled: z.boolean().default(false),
  })
  .strict();

type FormValues = z.input<typeof formSchema>;

export function MeetingForm() {
  const router = useRouter();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      scheduled_at: "",
      recording_enabled: false,
      lobby_enabled: false,
    },
  });

  const create = trpc.meetings.create.useMutation({
    onSuccess: (meeting) => {
      toast({ title: "Meeting created", description: meeting.title });
      router.push(`/app/meeting/${meeting.id}`);
    },
    onError: (err) => {
      toast({
        title: "Failed to create meeting",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  function onSubmit(values: FormValues) {
    const descriptionTrimmed = (values.description ?? "").trim();
    const scheduledAtRaw = values.scheduled_at ?? "";
    create.mutate({
      title: values.title.trim(),
      description: descriptionTrimmed === "" ? undefined : descriptionTrimmed,
      scheduled_at: scheduledAtRaw === "" ? null : new Date(scheduledAtRaw),
      recording_enabled: values.recording_enabled ?? false,
      lobby_enabled: values.lobby_enabled ?? false,
    });
  }

  const isPending = create.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Title <span className="text-destructive">*</span>
              </FormLabel>
              <FormControl>
                <Input
                  type="text"
                  maxLength={300}
                  placeholder="Weekly standup"
                  disabled={isPending}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  maxLength={2000}
                  rows={4}
                  placeholder="Optional details for participants"
                  disabled={isPending}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="scheduled_at"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Scheduled at</FormLabel>
              <FormControl>
                <Input type="datetime-local" disabled={isPending} {...field} />
              </FormControl>
              <FormDescription>
                Leave blank to start an ad-hoc meeting immediately.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="space-y-3">
          <FormField
            control={form.control}
            name="recording_enabled"
            render={({ field }) => (
              <Label className="flex items-center gap-2 font-normal">
                <input
                  type="checkbox"
                  checked={field.value}
                  onChange={(e) => {
                    field.onChange(e.target.checked);
                  }}
                  disabled={isPending}
                  className="size-4 rounded border-input"
                />
                <span>Enable recording</span>
              </Label>
            )}
          />
          <FormField
            control={form.control}
            name="lobby_enabled"
            render={({ field }) => (
              <Label className="flex items-center gap-2 font-normal">
                <input
                  type="checkbox"
                  checked={field.value}
                  onChange={(e) => {
                    field.onChange(e.target.checked);
                  }}
                  disabled={isPending}
                  className="size-4 rounded border-input"
                />
                <span>Enable lobby (host must admit guests)</span>
              </Label>
            )}
          />
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Creating..." : "Create meeting"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              router.push("/app/meetings");
            }}
            disabled={isPending}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}
