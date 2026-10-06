import { afterEach, describe, expect, it, vi } from "vitest";
import { OllamaProvider } from "@/services/llm/ollama";

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fetchMock = vi.fn(async () => ({ ok: true, status: 200, statusText: "OK", ...response }) as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("OllamaProvider.generate", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("calls the Ollama chat API and returns the trimmed answer", async () => {
    const fetchMock = mockFetch({
      json: async () => ({ message: { role: "assistant", content: "  hello  " }, done: true }),
    });

    const answer = await new OllamaProvider("http://ollama:11434").generate("Hi", { temperature: 0, maxTokens: 50 });

    expect(answer).toBe("hello");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://ollama:11434/api/chat");
    const body = JSON.parse(init.body as string);
    expect(body.messages).toEqual([{ role: "user", content: "Hi" }]);
    expect(body.stream).toBe(false);
    expect(body.options).toMatchObject({ temperature: 0, num_predict: 50 });
    expect(body.format).toBeUndefined();
  });

  it("asks for JSON mode when requested", async () => {
    const fetchMock = mockFetch({ json: async () => ({ message: { role: "assistant", content: "{}" }, done: true }) });
    await new OllamaProvider("http://x").generate("p", { json: true });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).format).toBe("json");
  });

  it("throws a clear error when Ollama responds with an error status", async () => {
    mockFetch({ ok: false, status: 404, statusText: "Not Found" });
    await expect(new OllamaProvider("http://x").generate("p")).rejects.toThrow("Ollama generate failed: 404 Not Found");
  });
});
