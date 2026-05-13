import { departmentsRouter } from "@/server/trpc/routers/departments";
import { router } from "@/server/trpc/trpc";

// 5c-2 will register additional routers here (e.g. callsRouter)
export const appRouter = router({
  departments: departmentsRouter,
});

export type AppRouter = typeof appRouter;
