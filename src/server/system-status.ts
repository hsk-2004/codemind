import type { PrismaClient } from "@prisma/client";
import { embeddingConfig, llmConfig, ollamaHeaders } from "@/services/llm/config";
import { PROVIDER_INFO, getActiveModel, isProviderConfigured } from "@/services/llm";
import { QDRANT_URL } from "@/services/vectorstore/qdrant";

export interface ServiceCheck {
  ok: boolean;
  latencyMs: number | null;
  detail: string;
}

export interface SystemStatus {
  checkedAt: string;
  ollama: ServiceCheck & { models: { name: string; sizeBytes: number }[] };
  /** The chat model currently selected. `installed` means ready to use: pulled locally, or API key present. */
  llm: { model: string; provider: string; providerLabel: string; location: "local" | "cloud"; installed: boolean; numCtx: number };
  cloud: { provider: string; label: string; configured: boolean }[];
  embedding: { model: string; installed: boolean };
  database: ServiceCheck & { pgvectorVersion: string | null };
  qdrant: ServiceCheck;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const start = performance.now();
  const value = await fn();
  return { value, ms: Math.round(performance.now() - start) };
}

const modelMatches = (installed: string, wanted: string) =>
  installed === wanted || installed === `${wanted}:latest`;

async function checkOllama(): Promise<SystemStatus["ollama"]> {
  try {
    const { value, ms } = await timed(async () => {
      const res = await fetch(`${llmConfig.baseUrl}/api/tags`, { headers: ollamaHeaders(), signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as { models: { name: string; size: number }[] };
    });
    const models = value.models.map((m) => ({ name: m.name, sizeBytes: m.size }));
    return { ok: true, latencyMs: ms, detail: `${models.length} model(s) installed`, models };
  } catch (error) {
    return { ok: false, latencyMs: null, detail: `Unreachable at ${llmConfig.baseUrl} (${String(error)}). If Ollama runs on a remote laptop, check that it is on and the tunnel is running.`, models: [] };
  }
}

async function checkDatabase(db: PrismaClient): Promise<SystemStatus["database"]> {
  try {
    const { value, ms } = await timed(() =>
      db.$queryRaw<{ extversion: string }[]>`SELECT extversion FROM pg_extension WHERE extname = 'vector'`,
    );
    const version = value[0]?.extversion ?? null;
    return {
      ok: true,
      latencyMs: ms,
      detail: version ? `PostgreSQL connected, pgvector ${version}` : "PostgreSQL connected, pgvector missing",
      pgvectorVersion: version,
    };
  } catch (error) {
    return { ok: false, latencyMs: null, detail: `Database error: ${String(error)}`, pgvectorVersion: null };
  }
}

async function checkQdrant(): Promise<ServiceCheck> {
  try {
    const { value, ms } = await timed(async () => {
      const res = await fetch(`${QDRANT_URL}/healthz`, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    });
    return { ok: value, latencyMs: ms, detail: value ? "Healthy (provisioned for future retrieval)" : "Unhealthy" };
  } catch {
    return { ok: false, latencyMs: null, detail: `Unreachable at ${QDRANT_URL}` };
  }
}

export async function getSystemStatus(db: PrismaClient): Promise<SystemStatus> {
  const [ollama, database, qdrant] = await Promise.all([checkOllama(), checkDatabase(db), checkQdrant()]);
  const has = (wanted: string) => ollama.models.some((m) => modelMatches(m.name, wanted));
  const active = getActiveModel();
  const info = PROVIDER_INFO[active.provider];

  return {
    checkedAt: new Date().toISOString(),
    ollama,
    llm: {
      model: active.model,
      provider: active.provider,
      providerLabel: info.label,
      location: info.location,
      installed: active.provider === "ollama" ? has(active.model) : isProviderConfigured(active.provider),
      numCtx: llmConfig.numCtx,
    },
    cloud: (["gemini", "groq"] as const).map((provider) => ({
      provider,
      label: PROVIDER_INFO[provider].label,
      configured: isProviderConfigured(provider),
    })),
    embedding: { model: embeddingConfig.model, installed: has(embeddingConfig.model) },
    database,
    qdrant,
  };
}
