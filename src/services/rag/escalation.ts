import type { ModelSelection } from "@/services/llm/provider";
import { NO_CONTEXT_ANSWER, type SourceDocument } from "./chain";

/**
 * Model cascade ("vertical model scaling"): every question goes to the small,
 * private local model first, and only answers that look weak are retried on a
 * larger cloud model. Most questions never leave the machine; the hard ones
 * still get a strong answer.
 */

export type EscalationReason = "no_answer" | "no_citation";

export const ESCALATION_REASONS: Record<EscalationReason, string> = {
  no_answer: "the local model said the retrieved code was not enough to answer",
  no_citation: "the local answer did not name any of the retrieved files",
};

/** Matches a file in an answer by its full path or, failing that, its file name. */
function mentionsSource(answer: string, path: string): boolean {
  const text = answer.toLowerCase();
  const full = path.toLowerCase();
  const name = full.split("/").pop() ?? full;
  return text.includes(full) || text.includes(name);
}

/**
 * Decides whether a RAG answer from the small model is weak enough to escalate.
 * Returns null when the answer is acceptable. With no retrieved sources there is
 * nothing a larger model could ground an answer in, so it never escalates.
 */
export function escalationReason(answer: string, sources: SourceDocument[]): EscalationReason | null {
  if (sources.length === 0) return null;
  if (answer.includes(NO_CONTEXT_ANSWER.slice(0, 40))) return "no_answer";
  // The prompt requires naming the files used; an answer citing none of them is likely ungrounded.
  if (!sources.some((doc) => mentionsSource(answer, doc.metadata.source))) return "no_citation";
  return null;
}

/**
 * The tiers in order, smallest first: the local model, then each configured
 * cloud provider's default model.
 */
export function modelTiers(
  localModel: string,
  cloud: { groq?: string; gemini?: string },
): ModelSelection[] {
  const tiers: ModelSelection[] = [{ provider: "ollama", model: localModel }];
  if (cloud.groq) tiers.push({ provider: "groq", model: cloud.groq });
  if (cloud.gemini) tiers.push({ provider: "gemini", model: cloud.gemini });
  return tiers;
}
