import { describe, expect, it } from "vitest";
import { suggestQuestions } from "@/services/rag/eval-questions";

const file = (fileName: string, sourceCode: string, summary = "") => ({ fileName, sourceCode, summary });
const noShuffle = () => 0.5;

describe("suggestQuestions", () => {
  const files = [
    file("src/auth.ts", "export function verifySession(token) {}\n"),
    file("src/billing.ts", "export class InvoiceBuilder {}\n"),
    file("src/readme-notes.md", "# Notes", "Describes how the nightly export job collects and uploads reports."),
    file("src/util.ts", "export function run() {}\n", "src/util.ts: Small helpers that format dates for the dashboard timeline view."),
  ];

  it("asks about named functions and classes, and about what a file is for", () => {
    const questions = suggestQuestions(files, 4, noShuffle);
    expect(questions).toContainEqual({ question: "Where is the function verifySession defined?", expectedFiles: ["src/auth.ts"] });
    expect(questions).toContainEqual({ question: "Where is the class InvoiceBuilder defined?", expectedFiles: ["src/billing.ts"] });
    expect(questions.some((q) => q.question.startsWith("Which file is responsible for this: Describes how the nightly export job"))).toBe(true);
  });

  it("uses each file once and never more questions than asked for", () => {
    const questions = suggestQuestions(files, 3, noShuffle);
    expect(questions).toHaveLength(3);
    expect(new Set(questions.flatMap((q) => q.expectedFiles)).size).toBe(3);
  });

  it("skips generic names and drops the path prefix of a summary", () => {
    const questions = suggestQuestions(files, 4, noShuffle);
    expect(questions.some((q) => q.question.includes(" run "))).toBe(false);
    expect(questions.find((q) => q.expectedFiles[0] === "src/util.ts")?.question).toContain("Small helpers that format dates");
    expect(questions.find((q) => q.expectedFiles[0] === "src/util.ts")?.question).not.toContain("src/util.ts:");
  });

  it("does not turn a line of code into a question", () => {
    const questions = suggestQuestions([file("a.md", "# a", "const severityClass: Record<string, string> = {"), file("b.md", "# b", "type Project = NonNullable<ReturnType<typeof useProject>>")], 5, noShuffle);
    expect(questions).toEqual([]);
  });

  it("returns nothing for an empty repository", () => {
    expect(suggestQuestions([], 5)).toEqual([]);
  });
});
