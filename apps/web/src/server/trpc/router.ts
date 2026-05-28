import { adminRouter } from "@/server/trpc/routers/admin";
import { authRouter } from "@/server/trpc/routers/auth";
import { billingRouter } from "@/server/trpc/routers/billing";
import { callsRouter } from "@/server/trpc/routers/calls";
import { chatRouter } from "@/server/trpc/routers/chat";
import { departmentsRouter } from "@/server/trpc/routers/departments";
import { meetingsRouter } from "@/server/trpc/routers/meetings";
import { recordingsRouter } from "@/server/trpc/routers/recordings";
import { sharedFilesRouter } from "@/server/trpc/routers/sharedFiles";
import { superadminRouter } from "@/server/trpc/routers/superadmin";
import { whiteboardSnapshotsRouter } from "@/server/trpc/routers/whiteboardSnapshots";
import { router } from "@/server/trpc/trpc";

export const appRouter = router({
  auth: authRouter,
  billing: billingRouter,
  calls: callsRouter,
  chat: chatRouter,
  departments: departmentsRouter,
  meetings: meetingsRouter,
  recordings: recordingsRouter,
  sharedFiles: sharedFilesRouter,
  whiteboardSnapshots: whiteboardSnapshotsRouter,
  admin: adminRouter,
  superadmin: superadminRouter,
});

export type AppRouter = typeof appRouter;
