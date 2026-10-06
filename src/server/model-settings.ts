import type { PrismaClient } from "@prisma/client";
import { defaultModelSelection, getActiveModel, isProviderConfigured, setActiveModel } from "@/services/llm";
import type { ModelSelection, ProviderId } from "@/services/llm";

const SETTING_KEY = "activeModel";
const REFRESH_MS = 10_000;
const PROVIDERS: ProviderId[] = ["ollama", "gemini", "groq"];

const globalForSettings = globalThis as unknown as { codemindModelLoadedAt?: number };

function parseSelection(value: unknown): ModelSelection | null {
  if (!value || typeof value !== "object") return null;
  const { provider, model } = value as Record<string, unknown>;
  if (typeof model !== "string" || !model.trim()) return null;
  if (!PROVIDERS.includes(provider as ProviderId)) return null;
  return { provider: provider as ProviderId, model };
}

/**
 * Makes sure this server instance is using the model chosen in the app.
 * The choice lives in the database so it survives restarts and is shared by
 * all instances; it is re-read at most every 10 seconds.
 */
export async function syncActiveModel(db: PrismaClient): Promise<ModelSelection> {
  const fallback = defaultModelSelection();
  const now = Date.now();
  if (globalForSettings.codemindModelLoadedAt && now - globalForSettings.codemindModelLoadedAt < REFRESH_MS) {
    return getActiveModel();
  }

  let selection = fallback;
  try {
    const row = await db.appSetting.findUnique({ where: { key: SETTING_KEY } });
    const saved = parseSelection(row?.value);
    // A saved cloud model is ignored if its API key has since been removed.
    if (saved && isProviderConfigured(saved.provider)) selection = saved;
  } catch (error) {
    console.error("Could not load the selected model, using the default:", error);
  }

  setActiveModel(selection);
  globalForSettings.codemindModelLoadedAt = now;
  return selection;
}

export async function saveActiveModel(db: PrismaClient, selection: ModelSelection): Promise<void> {
  await db.appSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: { ...selection } },
    update: { value: { ...selection } },
  });
  setActiveModel(selection);
  globalForSettings.codemindModelLoadedAt = Date.now();
}
