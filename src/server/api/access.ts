import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";

export async function hasProjectAccess(
  db: PrismaClient,
  userId: string,
  projectId: string,
): Promise<boolean> {
  if (!projectId.trim()) return false;
  const membership = await db.userToProject.findFirst({
    where: { userId, projectId, project: { deletedAt: null } },
    select: { id: true },
  });
  return membership !== null;
}

/** Throws FORBIDDEN unless the user is a member of the (non-archived) project. */
export async function assertProjectAccess(
  db: PrismaClient,
  userId: string,
  projectId: string,
): Promise<void> {
  if (!(await hasProjectAccess(db, userId, projectId))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this project" });
  }
}
