import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { BaseMessage } from "@langchain/core/messages";
import type { ChatMessage } from "../telemetry";

const ROLES: Record<string, ChatMessage["role"]> = { system: "system", human: "user", ai: "assistant" };

/** Turns LangChain messages into plain role/content pairs. */
export function toChatMessages(messages: BaseMessage[]): ChatMessage[] {
  return messages.map((m) => ({
    role: ROLES[m.getType()] ?? "user",
    content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
  }));
}

/** LangChain callback that remembers the exact messages sent to the chat model, for tracing. */
export class PromptCaptureHandler extends BaseCallbackHandler {
  name = "codemind_prompt_capture";
  prompt: ChatMessage[] | undefined;

  override handleChatModelStart(_llm: unknown, messages: BaseMessage[][]): void {
    this.prompt = toChatMessages(messages[0] ?? []);
  }
}
