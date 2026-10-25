/**
 * Follow-up questions. A question such as "and where is it used?" means nothing
 * on its own, so the conversation so far is used in two places: to widen the
 * retrieval query, and to tell the model what the follow-up refers to.
 */
export interface ChatTurn {
  question: string;
  answer: string;
}

export const MAX_HISTORY_TURNS = 3;
const MAX_QUESTION_CHARS = 300;
const MAX_ANSWER_CHARS = 600;

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max).trimEnd()}…` : text);

/** Keeps the latest few turns and shortens them, so history never crowds out the retrieved code. */
export function trimHistory(turns: ChatTurn[] | undefined): ChatTurn[] {
  return (turns ?? [])
    .filter((turn) => turn.question.trim() && turn.answer.trim())
    .slice(-MAX_HISTORY_TURNS)
    .map((turn) => ({ question: clip(turn.question.trim(), MAX_QUESTION_CHARS), answer: clip(turn.answer.trim(), MAX_ANSWER_CHARS) }));
}

const REFERS_BACK =
  /\b(it|its|this|that|these|those|they|them|their|there|then|same|above|previous|earlier|again|former|latter)\b|^\s*(and|but|so|also|what about|how about|why)\b/i;

/** Short questions and questions with a pronoun usually depend on the previous answer. */
export function isFollowUp(question: string): boolean {
  const words = question.trim().split(/\s+/).filter(Boolean);
  return words.length <= 5 || REFERS_BACK.test(question);
}

/**
 * The text used to search the repository. A follow-up is searched together with
 * the question before it, so "and where is it used?" still finds the topic.
 */
export function retrievalQuery(history: ChatTurn[], question: string): string {
  const last = history[history.length - 1];
  if (!last || !isFollowUp(question)) return question;
  return `${last.question}\n${question}`;
}

/** The question as the model sees it: the earlier turns first, then the follow-up. */
export function withHistory(question: string, history: ChatTurn[]): string {
  if (history.length === 0) return question;
  const earlier = history.map((turn) => `Q: ${turn.question}\nA: ${turn.answer}`).join("\n\n");
  return [
    `Earlier in this conversation (only to understand what the follow-up refers to):\n${earlier}`,
    `Follow-up question: ${question}`,
    "Answer the follow-up question in full sentences, using the repository context. Say which file and function you mean.",
  ].join("\n\n");
}
