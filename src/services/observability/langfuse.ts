import { AsyncLocalStorage } from "node:async_hooks";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import {
  LangfuseOtelSpanAttributes,
  setLangfuseTracerProvider,
  startObservation,
  type LangfuseGenerationAttributes,
  type LangfuseSpan,
} from "@langfuse/tracing";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { onLlmCall, type ChatMessage, type LlmCallEvent } from "../telemetry";

/**
 * Langfuse tracing for every call the app makes to a model.
 *
 * All model calls (answers, explanations, summaries, commit analysis and
 * embeddings) already pass through `emitLlmCall`, so one listener sees them all.
 * Each call becomes a Langfuse "generation" with its model, tokens in and out,
 * timings, prompt and reply. Calls made while serving one request (a question, a
 * file explanation, an indexing run) are grouped under one trace.
 *
 * Nothing happens until LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are set.
 */

export interface LangfuseConfig {
  enabled: boolean;
  publicKey: string;
  secretKey: string;
  baseUrl: string;
  /** Send the prompt and reply text too, not just tokens and timings. */
  captureContent: boolean;
  /** Longest text sent per prompt or reply. */
  maxContentChars: number;
  environment?: string;
  release?: string;
  /** Spans sent together, and how often a partly filled batch is sent (seconds). */
  flushAt: number;
  flushInterval: number;
}

export const DEFAULT_LANGFUSE_URL = "https://cloud.langfuse.com";
const DEFAULT_MAX_CONTENT_CHARS = 20_000;
/** Embedding calls can carry many code chunks, so only the start of their input is kept. */
const EMBEDDING_INPUT_CHARS = 1_000;

const isOff = (value: string | undefined) => /^(0|false|off|no)$/i.test(value?.trim() ?? "");
const positiveNumber = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export function readLangfuseConfig(env: Record<string, string | undefined> = process.env): LangfuseConfig {
  const publicKey = env.LANGFUSE_PUBLIC_KEY?.trim() ?? "";
  const secretKey = env.LANGFUSE_SECRET_KEY?.trim() ?? "";
  // Langfuse has used several names for the address; accept all of them.
  const baseUrl = (env.LANGFUSE_BASE_URL || env.LANGFUSE_BASEURL || env.LANGFUSE_HOST || DEFAULT_LANGFUSE_URL).trim().replace(/\/+$/, "");
  const environment = env.LANGFUSE_TRACING_ENVIRONMENT?.trim() || (env.NODE_ENV === "development" || env.NODE_ENV === "production" ? env.NODE_ENV : undefined);
  return {
    enabled: publicKey.length > 0 && secretKey.length > 0 && !isOff(env.LANGFUSE_ENABLED),
    publicKey,
    secretKey,
    baseUrl,
    captureContent: !isOff(env.LANGFUSE_CAPTURE_CONTENT),
    maxContentChars: Math.floor(positiveNumber(env.LANGFUSE_MAX_CONTENT_CHARS, DEFAULT_MAX_CONTENT_CHARS)),
    environment,
    release: env.LANGFUSE_RELEASE?.trim() || undefined,
    flushAt: Math.floor(positiveNumber(env.LANGFUSE_FLUSH_AT, 10)),
    flushInterval: positiveNumber(env.LANGFUSE_FLUSH_INTERVAL, 2),
  };
}

// ---- content safety ----------------------------------------------------------------

const SECRET_PATTERNS = [
  /ghp_[A-Za-z0-9]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /AIza[0-9A-Za-z_-]{30,}/g,
  /gsk_[A-Za-z0-9]{20,}/g,
  /sk-[A-Za-z0-9_-]{20,}/g,
  /xox[baprs]-[A-Za-z0-9-]{10,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /(?:pk|sk)-lf-[0-9a-f-]{20,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

/** Repository code can contain keys, and traces leave the machine, so obvious secrets are hidden first. */
export function redactSecrets(text: string): string {
  return SECRET_PATTERNS.reduce((out, pattern) => out.replace(pattern, "[redacted]"), text);
}

/** Cuts long text and says how much was left out. */
export function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n... [${text.length - max} more characters not sent]`;
}

const isMessage = (value: unknown): value is ChatMessage =>
  typeof value === "object" && value !== null && typeof (value as ChatMessage).role === "string" && typeof (value as ChatMessage).content === "string";

/** Makes a prompt, reply or other value safe and small enough to send. */
export function prepareContent(value: unknown, max: number): unknown {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return clip(redactSecrets(value), max);
  if (Array.isArray(value) && value.length > 0 && value.every(isMessage)) {
    return value.map((message) => ({ role: message.role, content: clip(redactSecrets(message.content), max) }));
  }
  try {
    const text = redactSecrets(JSON.stringify(value));
    return text.length > max ? clip(text, max) : (JSON.parse(text) as unknown);
  } catch {
    return clip(redactSecrets(String(value)), max);
  }
}

// ---- turning a model call into a Langfuse generation --------------------------------

export interface PreparedGeneration {
  name: string;
  type: "generation" | "embedding";
  attributes: LangfuseGenerationAttributes;
  startTime: Date;
  endTime: Date;
}

const compact = <T extends Record<string, unknown>>(object: T): Record<string, unknown> =>
  Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));

export function prepareGeneration(event: LlmCallEvent, config: Pick<LangfuseConfig, "captureContent" | "maxContentChars">, now: Date = new Date()): PreparedGeneration {
  const isEmbedding = event.operation === "embedding";
  const startTime = new Date(now.getTime() - Math.max(0, event.latencyMs));
  const cancelled = !event.success && event.error === "cancelled";
  const hasTokens = event.promptTokens !== undefined || event.completionTokens !== undefined;
  const limit = isEmbedding ? Math.min(config.maxContentChars, EMBEDDING_INPUT_CHARS) : config.maxContentChars;

  const attributes: LangfuseGenerationAttributes = {
    model: event.model,
    input: config.captureContent ? prepareContent(event.input, limit) : undefined,
    output: config.captureContent ? prepareContent(event.output, limit) : undefined,
    usageDetails: hasTokens
      ? {
          input: event.promptTokens ?? 0,
          output: event.completionTokens ?? 0,
          total: (event.promptTokens ?? 0) + (event.completionTokens ?? 0),
        }
      : undefined,
    completionStartTime: event.firstTokenMs !== undefined ? new Date(startTime.getTime() + event.firstTokenMs) : undefined,
    level: event.success ? "DEFAULT" : cancelled ? "WARNING" : "ERROR",
    statusMessage: event.success ? undefined : cancelled ? "Cancelled by the user" : event.error,
    metadata: compact({
      provider: event.provider ?? "ollama",
      operation: event.operation,
      projectId: event.projectId,
      inputChars: event.inputChars,
      latencyMs: Math.round(event.latencyMs),
      firstTokenMs: event.firstTokenMs,
      tokensPerSecond: event.tokensPerSecond,
      loadDurationMs: event.loadDurationMs,
      promptEvalMs: event.promptEvalMs,
      evalMs: event.evalMs,
      totalDurationMs: event.totalDurationMs,
      ...event.metadata,
    }),
  };
  return { name: event.operation, type: isEmbedding ? "embedding" : "generation", attributes, startTime, endTime: now };
}

// ---- tracing ---------------------------------------------------------------------------

/** What identifies a trace: one question, one explanation, one indexing run. */
export interface TraceContext {
  name: string;
  userId?: string;
  sessionId?: string;
  tags?: string[];
  input?: unknown;
  metadata?: Record<string, unknown>;
}

interface Scope {
  context: TraceContext;
  startedAt: Date;
  /** Created when the first model call happens, so requests that never call a model leave no trace. */
  root?: LangfuseSpan;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 500);

export class LangfuseTelemetry {
  private readonly scopes = new AsyncLocalStorage<Scope>();
  private provider?: NodeTracerProvider;
  private listening = false;

  constructor(readonly config: LangfuseConfig) {
    if (config.enabled) this.start();
  }

  get enabled(): boolean {
    return this.provider !== undefined;
  }

  private start() {
    const { config } = this;
    const processor = new LangfuseSpanProcessor({
      publicKey: config.publicKey,
      secretKey: config.secretKey,
      baseUrl: config.baseUrl,
      environment: config.environment,
      release: config.release,
      flushAt: config.flushAt,
      flushInterval: config.flushInterval,
      exportMode: "batched",
    });
    // Langfuse gets its own provider, so nothing else in the process is affected.
    this.provider = new NodeTracerProvider({ spanProcessors: [processor] });
    setLangfuseTracerProvider(this.provider);
  }

  /** Starts sending every model call to Langfuse. Safe to call more than once. */
  listen(): void {
    if (!this.provider || this.listening) return;
    this.listening = true;
    onLlmCall(this.listener);
  }

  readonly listener = (event: LlmCallEvent): void => {
    if (!this.provider) return;
    try {
      this.recordCall(event, this.scopes.getStore());
    } catch (error) {
      console.error("Langfuse: could not record a model call:", error);
    }
  };

  private content(value: unknown, limit = this.config.maxContentChars): unknown {
    return this.config.captureContent ? prepareContent(value, limit) : undefined;
  }

  private rootOf(scope: Scope): LangfuseSpan {
    if (scope.root) return scope.root;
    const { context } = scope;
    const root = startObservation(context.name, { input: this.content(context.input), metadata: context.metadata }, { startTime: scope.startedAt });
    const span = root.otelSpan;
    span.setAttribute(LangfuseOtelSpanAttributes.TRACE_NAME, context.name);
    if (context.userId) span.setAttribute(LangfuseOtelSpanAttributes.TRACE_USER_ID, context.userId);
    if (context.sessionId) span.setAttribute(LangfuseOtelSpanAttributes.TRACE_SESSION_ID, context.sessionId);
    if (context.tags?.length) span.setAttribute(LangfuseOtelSpanAttributes.TRACE_TAGS, context.tags);
    scope.root = root;
    return root;
  }

  private recordCall(event: LlmCallEvent, scope: Scope | undefined) {
    const prepared = prepareGeneration(event, this.config);
    const options = { startTime: prepared.startTime, parentSpanContext: scope ? this.rootOf(scope).otelSpan.spanContext() : undefined };
    const observation =
      prepared.type === "embedding"
        ? startObservation(prepared.name, prepared.attributes, { ...options, asType: "embedding" })
        : startObservation(prepared.name, prepared.attributes, { ...options, asType: "generation" });
    // A call made outside any request is its own trace.
    if (!scope) observation.otelSpan.setAttribute(LangfuseOtelSpanAttributes.TRACE_NAME, prepared.name);
    observation.end(prepared.endTime);
  }

  private fail(scope: Scope, error: unknown) {
    scope.root?.update({ level: "ERROR", statusMessage: errorText(error) });
  }

  private finish(scope: Scope) {
    scope.root?.end();
  }

  /** Runs `fn` so that every model call inside it is grouped under one trace. */
  async run<T>(context: TraceContext, fn: () => Promise<T>): Promise<T> {
    if (!this.provider) return fn();
    const scope: Scope = { context, startedAt: new Date() };
    try {
      return await this.scopes.run(scope, fn);
    } catch (error) {
      this.fail(scope, error);
      throw error;
    } finally {
      this.finish(scope);
    }
  }

  /** The same for a stream of events: each step runs inside the trace, however the stream is read. */
  async *traceGenerator<E>(context: TraceContext, source: () => AsyncIterable<E>): AsyncGenerator<E> {
    if (!this.provider) {
      yield* source();
      return;
    }
    const scope: Scope = { context, startedAt: new Date() };
    const iterator = this.scopes.run(scope, () => source()[Symbol.asyncIterator]());
    try {
      for (;;) {
        const step = await this.scopes.run(scope, () => iterator.next());
        if (step.done) return;
        yield step.value;
      }
    } catch (error) {
      this.fail(scope, error);
      throw error;
    } finally {
      // When the reader stops early (Stop pressed), let the source clean up inside the trace too.
      await this.scopes.run(scope, async () => iterator.return?.()).catch(() => undefined);
      this.finish(scope);
    }
  }

  /** Adds the answer or other facts to the trace of the request being served. */
  annotate(update: { output?: unknown; metadata?: Record<string, unknown> }): void {
    const scope = this.scopes.getStore();
    if (!this.provider || !scope) return;
    try {
      this.rootOf(scope).update({ output: this.content(update.output), metadata: update.metadata });
    } catch (error) {
      console.error("Langfuse: could not update the trace:", error);
    }
  }

  /** Records the search step, between the question and the model call. */
  retrieval(info: { query: string; sources: { file: string; score: number }[]; ms: number; metadata?: Record<string, unknown> }): void {
    const scope = this.scopes.getStore();
    if (!this.provider || !scope) return;
    try {
      const observation = startObservation(
        "retrieval",
        { input: this.content(info.query), output: { sources: info.sources }, metadata: info.metadata },
        { asType: "retriever", startTime: new Date(Date.now() - Math.max(0, info.ms)), parentSpanContext: this.rootOf(scope).otelSpan.spanContext() },
      );
      observation.end();
    } catch (error) {
      console.error("Langfuse: could not record retrieval:", error);
    }
  }

  /** Sends whatever is waiting. Used before the process ends, and in tests. */
  async flush(): Promise<void> {
    await this.provider?.forceFlush();
  }

  async shutdown(): Promise<void> {
    await this.provider?.shutdown();
    this.provider = undefined;
  }
}

// ---- the one instance the app uses ------------------------------------------------------

const globalForLangfuse = globalThis as unknown as { codemindLangfuse?: LangfuseTelemetry };

export function getLangfuse(): LangfuseTelemetry {
  if (!globalForLangfuse.codemindLangfuse) {
    const instance = new LangfuseTelemetry(readLangfuseConfig());
    globalForLangfuse.codemindLangfuse = instance;
    if (instance.enabled) {
      // Batches are sent every couple of seconds; this sends the last one when the process winds down.
      process.once("beforeExit", () => void instance.flush());
    }
  }
  return globalForLangfuse.codemindLangfuse;
}

/** Called once when the server starts. Does nothing without Langfuse keys. */
export function registerLangfuse(): void {
  const langfuse = getLangfuse();
  if (!langfuse.enabled) return;
  langfuse.listen();
  const { config } = langfuse;
  console.log(`Langfuse tracing is on (${config.baseUrl}, ${config.captureContent ? "prompts and replies included" : "tokens and timings only"}).`);
}

export const withLangfuseTrace = <T>(context: TraceContext, fn: () => Promise<T>): Promise<T> => getLangfuse().run(context, fn);
export const traceLangfuseGenerator = <E>(context: TraceContext, source: () => AsyncIterable<E>): AsyncGenerator<E> => getLangfuse().traceGenerator(context, source);
export const annotateLangfuseTrace = (update: { output?: unknown; metadata?: Record<string, unknown> }): void => getLangfuse().annotate(update);
export const recordLangfuseRetrieval = (info: Parameters<LangfuseTelemetry["retrieval"]>[0]): void => getLangfuse().retrieval(info);
