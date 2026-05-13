import { callsRouter } from "@/server/trpc/routers/calls";
import { departmentsRouter } from "@/server/trpc/routers/departments";
import { meetingsRouter } from "@/server/trpc/routers/meetings";
import { router } from "@/server/trpc/trpc";

export const appRouter = router({
  calls: callsRouter,
  departments: departmentsRouter,
  meetings: meetingsRouter,
});

export type AppRouter = typeof appRouter;
