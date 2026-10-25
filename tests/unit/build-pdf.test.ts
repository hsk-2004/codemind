import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildReportPdf } from "@/services/report/build-pdf";
import { ALL_SECTIONS, type ReportData } from "@/services/report/types";

const base = (over: Partial<ReportData> = {}): ReportData => ({
  generatedAt: new Date("2026-10-25T10:00:00Z"),
  project: { name: "CodeMind", githubUrl: "https://github.com/hsk-2004/codemind", createdAt: new Date("2026-10-01T10:00:00Z") },
  overview: { indexedFiles: 220, embeddedFiles: 220, functionChunks: 792, commits: 12, breakingCommits: 2, savedAnswers: 3, latestCommitAt: new Date("2026-10-24T10:00:00Z") },
  languages: [{ language: "TypeScript", files: 150, percent: 90 }, { language: "JavaScript", files: 10, percent: 6 }],
  tooling: [{ label: "Docker", value: "Dockerfile, docker-compose.yml" }],
  suggestions: ["No automated tests detected."],
  breaking: [{ date: new Date("2026-10-20T10:00:00Z"), severity: "high", message: "Rename the API", author: "Someone", details: "Clients must update" }],
  breakingBySeverity: { high: 1, low: 1 },
  answers: [{ question: "How does it work?", answer: "## Title\n\nUses **RAG** → fast", askedAt: new Date("2026-10-22T10:00:00Z"), sources: ["a.ts"] }],
  aiUsage: { calls: 40, errors: 1, promptTokens: 9000, completionTokens: 2000, avgLatencyMs: 1500, avgTokensPerSecond: 55, models: [{ model: "qwen2.5-coder:3b-instruct", provider: "ollama", calls: 30, avgTokensPerSecond: 50, avgLatencyMs: 1200 }] },
  ...over,
});

const pageCount = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPageCount();

describe("buildReportPdf", () => {
  it("produces a valid PDF", async () => {
    const bytes = await buildReportPdf(base());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(await pageCount(bytes)).toBeGreaterThanOrEqual(1);
  });

  it("survives text the PDF font cannot draw", async () => {
    const bytes = await buildReportPdf(
      base({ project: { name: "プロジェクト 🙂", githubUrl: "https://github.com/a/b", createdAt: new Date() }, answers: [{ question: "日本語? ✓ → ≈", answer: "emoji 🚀 and 漢字", askedAt: new Date(), sources: [] }] }),
    );
    expect(await pageCount(bytes)).toBeGreaterThanOrEqual(1);
  });

  it("starts new pages for a long report and numbers them", async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ question: `Question ${i}?`, answer: "word ".repeat(300), askedAt: new Date(), sources: ["a.ts", "b.ts", "c.ts", "d.ts"] }));
    const breaking = Array.from({ length: 30 }, (_, i) => ({ date: new Date(), severity: "medium", message: `Commit number ${i} ` + "x".repeat(200), author: "A".repeat(40), details: "d ".repeat(200) }));
    const bytes = await buildReportPdf(base({ answers: many, breaking }));
    expect(await pageCount(bytes)).toBeGreaterThan(3);
  });

  it("leaves out the sections that are switched off", async () => {
    const full = await buildReportPdf(base(), ALL_SECTIONS);
    const minimal = await buildReportPdf(base(), { languages: false, breaking: false, answers: false, aiUsage: false });
    expect(minimal.length).toBeLessThan(full.length);
  });

  it("handles an empty repository", async () => {
    const bytes = await buildReportPdf(
      base({
        overview: { indexedFiles: 0, embeddedFiles: 0, functionChunks: 0, commits: 0, breakingCommits: 0, savedAnswers: 0, latestCommitAt: null },
        languages: [], tooling: [], suggestions: [], breaking: [], breakingBySeverity: {}, answers: [],
        aiUsage: { calls: 0, errors: 0, promptTokens: 0, completionTokens: 0, avgLatencyMs: null, avgTokensPerSecond: null, models: [] },
      }),
    );
    expect(await pageCount(bytes)).toBe(1);
  });
});
