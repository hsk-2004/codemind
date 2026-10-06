import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";

import { db } from "@/server/db";
import { ensureLocalUser } from "@/server/local-user";
import { syncActiveModel } from "@/server/model-settings";

export const createTRPCContext = async (opts: { headers: Headers }) => {
  return {
    db,
    ...opts,
  };
};

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createCallerFactory = t.createCallerFactory;
export const createTRPCRouter = t.router;

/**
 * There is no sign-in. Every request runs as the built-in local user, which is
 * attached to the context so routers can scope data to it. The selected chat
 * model is also loaded here, so every procedure uses the model chosen in the app.
 */
const withLocalUser = t.middleware(async ({ next, ctx }) => {
  const [userId] = await Promise.all([ensureLocalUser(ctx.db), syncActiveModel(ctx.db)]);
  return next({ ctx: { ...ctx, user: { userId } } });
});

export const appProcedure = t.procedure.use(withLocalUser);
