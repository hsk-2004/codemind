import type { PrismaClient } from "@prisma/client";

/**
 * CodeMind runs without sign-in: every request acts as this single built-in user.
 * Projects and saved answers still reference a User row, so the row is created on
 * first use.
 */
export const LOCAL_USER_ID = "local-user";

const globalForUser = globalThis as unknown as { codemindLocalUser?: Promise<string> };

async function createLocalUser(db: PrismaClient): Promise<string> {
  const existing = await db.user.findUnique({ where: { id: LOCAL_USER_ID }, select: { id: true } });
  if (existing) return LOCAL_USER_ID;

  await db.user.create({
    data: { id: LOCAL_USER_ID, emailAddress: "local@codemind.local", firstName: "Local", lastName: "User" },
  });

  // One-time adoption: projects created while sign-in existed belong to other
  // user ids. Link them to the local user so they stay visible.
  const projects = await db.project.findMany({ select: { id: true } });
  if (projects.length > 0) {
    await db.userToProject.createMany({
      data: projects.map((p) => ({ userId: LOCAL_USER_ID, projectId: p.id })),
      skipDuplicates: true,
    });
  }
  return LOCAL_USER_ID;
}

/** Returns the local user's id, creating the user on first call. */
export function ensureLocalUser(db: PrismaClient): Promise<string> {
  globalForUser.codemindLocalUser ??= createLocalUser(db).catch((error: unknown) => {
    globalForUser.codemindLocalUser = undefined; // retry on the next request
    throw error;
  });
  return globalForUser.codemindLocalUser;
}
