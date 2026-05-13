import { callsRouter } from "@/server/trpc/routers/calls";
import { departmentsRouter } from "@/server/trpc/routers/departments";
import { router } from "@/server/trpc/trpc";

export const appRouter = router({
  calls: callsRouter,
  departments: departmentsRouter,
});

export type AppRouter = typeof appRouter;
