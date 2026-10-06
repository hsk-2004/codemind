import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    DATABASE_URL: z.string().url(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
    OLLAMA_API_KEY: z.string().optional(),
    LLM_PROVIDER: z.enum(["ollama"]).default("ollama"),
    LLM_MODEL: z.string().default("qwen2.5-coder:3b-instruct"),
    LLM_NUM_CTX: z.coerce.number().default(3072),

    EMBEDDING_PROVIDER: z.enum(["ollama"]).default("ollama"),
    EMBEDDING_MODEL: z.string().default("nomic-embed-text"),

    QDRANT_URL: z.string().url().default("http://localhost:6333"),

    GITHUB_TOKEN: z.string().optional(),

    GEMINI_API_KEY: z.string().optional(),
    GROQ_API_KEY: z.string().optional(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,

    OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
    OLLAMA_API_KEY: process.env.OLLAMA_API_KEY,
    LLM_PROVIDER: process.env.LLM_PROVIDER,
    LLM_MODEL: process.env.LLM_MODEL,
    LLM_NUM_CTX: process.env.LLM_NUM_CTX,

    EMBEDDING_PROVIDER: process.env.EMBEDDING_PROVIDER,
    EMBEDDING_MODEL: process.env.EMBEDDING_MODEL,

    QDRANT_URL: process.env.QDRANT_URL,

    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GROQ_API_KEY: process.env.GROQ_API_KEY,

    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
