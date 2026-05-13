import { prisma } from "@yelli/db";

import { protectedProcedure, router } from "@/server/trpc/trpc";

export const departmentsRouter = router({
  list: protectedProcedure.query(async () => {
    // L6 tenant-guard injects organization_id via AsyncLocalStorage
    const departments = await prisma.department.findMany({
      orderBy: [{ group_label: "asc" }, { sort_order: "asc" }],
      select: {
        id: true,
        name: true,
        description: true,
        group_label: true,
        sort_order: true,
        auto_answer_enabled: true,
      },
    });
    return departments;
  }),
});
