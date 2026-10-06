import { afterEach, describe, expect, it, vi } from "vitest";
import { isGeminiChatModel, isGroqChatModel, isOllamaChatModel } from "@/services/llm/catalog";
import { GeminiProvider } from "@/services/llm/gemini";
import { GroqProvider } from "@/services/llm/groq";
import { fetchWithRetry } from "@/services/llm/retry";
import { onLlmCall, type LlmCallEvent } from "@/services/telemetry";

const noWait = { sleep: async () => {} };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function stubFetch(...responses: Response[]) {
  const fetchMock = vi.fn(async () => responses.shift() ?? json({ error: { message: "no more responses" } }, 500));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const bodyOf = (fetchMock: ReturnType<typeof stubFetch>, call = 0) =>
  JSON.parse((fetchMock.mock.calls[call] as unknown as [string, RequestInit])[1].body as string);

afterEach(() => vi.unstubAllGlobals());

describe("GeminiProvider", () => {
  // A Response body can only be read once, so each test gets a fresh one.
  const ok = () =>
    json({
      candidates: [{ content: { parts: [{ text: "hidden reasoning", thought: true }, { text: "  The answer.  " }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 10 },
    });

  it("returns the visible answer, drops thinking parts, and reports token counts", async () => {
    const fetchMock = stubFetch(ok());
    const result = await new GeminiProvider("gemini-flash-lite-latest", "key", noWait).complete("Question?", { system: "Be brief.", maxTokens: 100 });

    expect(result.text).toBe("The answer.");
    expect(result.metrics.promptTokens).toBe(40);
    expect(result.metrics.completionTokens).toBe(10);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/models/gemini-flash-lite-latest:generateContent");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("key");
    const body = bodyOf(fetchMock);
    expect(body.systemInstruction.parts[0].text).toBe("Be brief.");
    expect(body.contents[0].parts[0].text).toBe("Question?");
    // Headroom so thinking tokens cannot cut the visible answer off.
    expect(body.generationConfig.maxOutputTokens).toBeGreaterThan(100);
    expect(body.generationConfig.responseMimeType).toBeUndefined();
  });

  it("asks for JSON output when requested", async () => {
    const fetchMock = stubFetch(json({ candidates: [{ content: { parts: [{ text: "{}" }] } }] }));
    await new GeminiProvider("m", "key", noWait).generate("p", { json: true });
    expect(bodyOf(fetchMock).generationConfig.responseMimeType).toBe("application/json");
  });

  it("retries when the model is temporarily overloaded", async () => {
    const fetchMock = stubFetch(json({ error: { message: "high demand" } }, 503), ok());
    const text = await new GeminiProvider("m", "key", noWait).generate("p");
    expect(text).toBe("The answer.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces the provider's error message after retries are exhausted", async () => {
    stubFetch(...[1, 2, 3].map(() => json({ error: { message: "This model is currently experiencing high demand." } }, 503)));
    await expect(new GeminiProvider("m", "key", noWait).generate("p")).rejects.toThrow(
      "Gemini request failed (503): This model is currently experiencing high demand.",
    );
  });

  it("fails clearly on an empty answer or a missing key", async () => {
    stubFetch(json({ candidates: [{ content: { parts: [] }, finishReason: "MAX_TOKENS" }] }));
    await expect(new GeminiProvider("m", "key", noWait).generate("p")).rejects.toThrow("empty answer (MAX_TOKENS)");
    await expect(new GeminiProvider("m", "", noWait).generate("p")).rejects.toThrow("GEMINI_API_KEY is not set");
  });
});

describe("GroqProvider", () => {
  const ok = () =>
    json({
      choices: [{ message: { content: "Fast answer.", reasoning: "hidden" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 86, completion_tokens: 120, prompt_time: 0.005, completion_time: 0.2, total_time: 0.205, queue_time: 0.04 },
    });

  it("returns the answer with Groq's own timings and computed speed", async () => {
    const fetchMock = stubFetch(ok());
    const result = await new GroqProvider("openai/gpt-oss-20b", "gsk", noWait).complete("Q", { system: "S" });

    expect(result.text).toBe("Fast answer.");
    expect(result.metrics).toMatchObject({
      promptTokens: 86,
      completionTokens: 120,
      promptEvalMs: 5,
      evalMs: 200,
      totalDurationMs: 205,
      tokensPerSecond: 600,
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer gsk");
    expect(bodyOf(fetchMock).messages).toEqual([{ role: "system", content: "S" }, { role: "user", content: "Q" }]);
  });

  it("uses JSON mode when requested and does not retry client errors", async () => {
    const fetchMock = stubFetch(ok());
    await new GroqProvider("m", "gsk", noWait).generate("p", { json: true });
    expect(bodyOf(fetchMock).response_format).toEqual({ type: "json_object" });

    const failing = stubFetch(json({ error: { message: "Invalid API Key" } }, 401));
    await expect(new GroqProvider("m", "bad", noWait).generate("p")).rejects.toThrow("Groq request failed (401): Invalid API Key");
    expect(failing).toHaveBeenCalledTimes(1);
  });

  it("records provider, model and metrics in telemetry", async () => {
    stubFetch(ok());
    const events: LlmCallEvent[] = [];
    const off = onLlmCall((e) => events.push(e));
    await new GroqProvider("openai/gpt-oss-20b", "gsk", noWait).generate("p", { operation: "file_summary", projectId: "p1" });
    off();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      provider: "groq",
      model: "openai/gpt-oss-20b",
      operation: "file_summary",
      projectId: "p1",
      success: true,
      tokensPerSecond: 600,
    });
  });
});

describe("fetchWithRetry", () => {
  it("backs off exponentially and stops after the configured attempts", async () => {
    const fetchMock = stubFetch(json({}, 429), json({}, 429), json({}, 429));
    const waits: number[] = [];
    const res = await fetchWithRetry("https://x", {}, { attempts: 3, baseDelayMs: 100, sleep: async (ms) => void waits.push(ms) });
    expect(res.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([100, 200]);
  });
});

describe("model catalog filters", () => {
  it("keeps Gemini text models and drops speech, image, embedding and live variants", () => {
    expect(isGeminiChatModel("gemini-3.8-flash")).toBe(true);
    expect(isGeminiChatModel("gemini-flash-lite-latest")).toBe(true);
    for (const name of ["gemini-3.8-flash-tts", "gemini-3.1-flash-image", "gemini-embedding-2", "gemini-3.1-flash-live-preview", "gemini-3.5-transcribe", "gemini-robotics-er-2-preview"]) {
      expect(isGeminiChatModel(name)).toBe(false);
    }
    expect(isGeminiChatModel("gemini-3.8-flash", ["embedContent"])).toBe(false);
  });

  it("keeps Groq chat models and drops speech and moderation models", () => {
    expect(isGroqChatModel("openai/gpt-oss-20b")).toBe(true);
    expect(isGroqChatModel("qwen/qwen3.8-27b")).toBe(true);
    for (const id of ["whisper-large-v3", "meta-llama/llama-prompt-guard-2-22m", "canopylabs/orpheus-v1-english", "openai/gpt-oss-safeguard-20b"]) {
      expect(isGroqChatModel(id)).toBe(false);
    }
  });

  it("hides embedding models from the local chat list", () => {
    expect(isOllamaChatModel("qwen2.5-coder:3b-instruct")).toBe(true);
    expect(isOllamaChatModel("codellama:7b")).toBe(true);
    expect(isOllamaChatModel("nomic-embed-text:latest")).toBe(false);
  });
});
