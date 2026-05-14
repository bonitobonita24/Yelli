import { adminRouter } from "@/server/trpc/routers/admin";
import { billingRouter } from "@/server/trpc/routers/billing";
import { callsRouter } from "@/server/trpc/routers/calls";
import { chatRouter } from "@/server/trpc/routers/chat";
import { departmentsRouter } from "@/server/trpc/routers/departments";
import { meetingsRouter } from "@/server/trpc/routers/meetings";
import { recordingsRouter } from "@/server/trpc/routers/recordings";
import { superadminRouter } from "@/server/trpc/routers/superadmin";
import { router } from "@/server/trpc/trpc";

export const appRouter = router({
  calls: callsRouter,
  chat: chatRouter,
  departments: departmentsRouter,
  meetings: meetingsRouter,
  recordings: recordingsRouter,
  admin: adminRouter,
  billing: billingRouter,
  superadmin: superadminRouter,
});

export type AppRouter = typeof appRouter;
