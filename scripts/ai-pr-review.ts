/**
 * AI-assisted PR review used by the GitHub Actions "AI Review" workflow.
 * Reads a unified diff, runs CodeMind's commit summary + breaking-change
 * analysis against a local Ollama model, and prints a markdown report.
 *
 * Usage: tsx scripts/ai-pr-review.ts <diff-file> [pr-title]
 */
import { readFileSync } from "node:fs";
import { AisummariseCommit, detectBreakingChanges } from "../src/lib/ai";

const SEVERITY_ICON: Record<string, string> = { low: "🟢", medium: "🟡", high: "🟠", critical: "🔴" };

async function main() {
  const [diffPath, title = "Pull request"] = process.argv.slice(2);
  if (!diffPath) {
    console.error("Usage: tsx scripts/ai-pr-review.ts <diff-file> [pr-title]");
    process.exit(2);
  }

  const diff = readFileSync(diffPath, "utf8");
  if (!diff.trim()) {
    console.log("## 🤖 CodeMind AI Review\n\nNo code changes in this pull request.");
    return;
  }

  const [summary, breaking] = await Promise.all([
    AisummariseCommit(diff),
    detectBreakingChanges(diff, title),
  ]);

  const lines = [
    "## 🤖 CodeMind AI Review",
    "",
    `_Model: \`${process.env.LLM_MODEL ?? "qwen2.5-coder:3b-instruct"}\` via Ollama. AI output is advisory; verify before acting._`,
    "",
    "### Summary",
    summary,
    "",
    "### Breaking-change check",
  ];

  if (!breaking.analyzed) {
    lines.push("⚠️ AI analysis unavailable (model could not be reached or returned invalid output). No verdict was made.");
  } else if (breaking.hasBreakingChanges) {
    const icon = SEVERITY_ICON[breaking.severity ?? ""] ?? "⚠️";
    lines.push(
      `${icon} **Possible breaking change** (severity: ${breaking.severity ?? "unknown"})`,
      "",
      breaking.details ?? "",
    );
    if (breaking.affectedComponents?.length) {
      lines.push("", `**Affected:** ${breaking.affectedComponents.map((c) => `\`${c}\``).join(", ")}`);
    }
    if (breaking.migrationRequired && breaking.migrationSteps) {
      lines.push("", `**Migration:** ${breaking.migrationSteps}`);
    }
  } else {
    lines.push("✅ No breaking changes detected.");
  }

  console.log(lines.join("\n"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
