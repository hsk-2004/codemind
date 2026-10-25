import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { clip, stripMarkdown, toWinAnsi } from "./pdf-text";
import { ACCENT, BAR_COLORS, CONTENT_W, H, M, SEVERITY, W, Writer, MUTED } from "./writer";
import { ALL_SECTIONS, type ReportData, type ReportOptions } from "./types";

const fmtDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const fmtNum = (n: number) => new Intl.NumberFormat("en").format(n);
const fmtMs = (ms: number | null) => (ms == null ? "n/a" : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);

/** Builds the project report PDF from already-gathered data. */
export async function buildReportPdf(data: ReportData, options: ReportOptions = ALL_SECTIONS): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${data.project.name} - CodeMind report`);
  doc.setAuthor("CodeMind");
  doc.setCreationDate(data.generatedAt);
  const w = new Writer(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold), await doc.embedFont(StandardFonts.Courier), `${data.project.name} - CodeMind report`);

  // Title block
  w.page.drawRectangle({ x: 0, y: H - 112, width: W, height: 112, color: ACCENT });
  w.page.drawText(toWinAnsi(clip(data.project.name, 40)), { x: M, y: H - 62, size: 26, font: w.bold, color: rgb(1, 1, 1) });
  w.page.drawText("Project report", { x: M, y: H - 84, size: 12, font: w.regular, color: rgb(0.85, 0.9, 1) });
  w.page.drawText(toWinAnsi(clip(data.project.githubUrl, 80)), { x: M, y: H - 100, size: 9, font: w.regular, color: rgb(0.85, 0.9, 1) });
  w.y = H - 130;
  w.text(`Generated ${fmtDate(data.generatedAt)}. Connected ${fmtDate(data.project.createdAt)}.${data.overview.latestCommitAt ? ` Latest analysed commit ${fmtDate(data.overview.latestCommitAt)}.` : ""}`, { size: 9, color: MUTED });

  // Overview
  const o = data.overview;
  w.heading("Overview");
  w.tiles([
    { value: fmtNum(o.indexedFiles), label: "Files indexed" },
    { value: `${fmtNum(o.embeddedFiles)} / ${fmtNum(o.indexedFiles)}`, label: "Files with a search vector" },
    { value: fmtNum(o.functionChunks), label: "Function-level chunks" },
    { value: fmtNum(o.commits), label: "Commits analysed" },
    { value: fmtNum(o.breakingCommits), label: "Commits with breaking changes" },
    { value: fmtNum(o.savedAnswers), label: "Saved answers" },
  ]);
  w.text(
    o.indexedFiles === 0
      ? "No files have been indexed for this repository yet."
      : `CodeMind has read ${fmtNum(o.indexedFiles)} files of this repository and split them into ${fmtNum(o.functionChunks)} function-level chunks, so questions can be answered from the exact functions involved.`,
    { size: 9.5, color: MUTED },
  );

  if (options.languages) {
    w.heading("Languages and tooling");
    if (data.languages.length === 0) w.text("No source files were recognised.", { color: MUTED });
    else w.bars(data.languages.slice(0, 8).map((l) => ({ label: l.language, value: l.files, note: `${l.files} files, ${l.percent}%` })));
    if (data.tooling.length > 0) {
      w.gap(6);
      w.table([{ header: "Detected", weight: 2 }, { header: "Files", weight: 5, mono: true }], data.tooling.map((t) => [t.label, t.value]));
    }
    if (data.suggestions.length > 0) {
      w.subheading("Suggestions");
      data.suggestions.forEach((s) => w.text(`• ${s}`, { size: 9.5, x: M + 4 }));
    }
  }

  if (options.breaking) {
    w.heading("Breaking changes");
    const entries = Object.entries(data.breakingBySeverity).sort(([a], [b]) => Object.keys(SEVERITY).indexOf(a) - Object.keys(SEVERITY).indexOf(b));
    if (o.breakingCommits === 0) w.text("None of the analysed commits was flagged as a breaking change.", { color: MUTED });
    else {
      w.text(`${o.breakingCommits} of ${o.commits} analysed commits (${Math.round((o.breakingCommits / Math.max(o.commits, 1)) * 100)}%) were flagged. The check is advisory and can miss or over-flag changes.`, { size: 9.5 });
      w.gap(4);
      if (entries.length > 0) {
        w.need(20);
        let x = M;
        entries.forEach(([severity, count]) => {
          const label = toWinAnsi(`${severity}: ${count}`);
          const width = w.bold.widthOfTextAtSize(label, 9) + 16;
          w.page.drawRectangle({ x, y: w.y - 16, width, height: 16, color: SEVERITY[severity] ?? MUTED });
          w.page.drawText(label, { x: x + 8, y: w.y - 11.5, size: 9, font: w.bold, color: rgb(1, 1, 1) });
          x += width + 6;
        });
        w.y -= 24;
      }
      w.table(
        [{ header: "Date", weight: 1.4 }, { header: "Severity", weight: 1.2 }, { header: "Commit", weight: 4.5 }, { header: "Author", weight: 1.6 }],
        data.breaking.map((b) => [fmtDate(b.date), b.severity, clip(b.message, 90) + (b.details ? `\n${clip(b.details, 160)}` : ""), clip(b.author, 18)]),
      );
    }
  }

  if (options.answers) {
    w.heading("Saved questions and answers");
    if (data.answers.length === 0) w.text("No answers have been saved yet. Save one from Ask AI to keep it here.", { color: MUTED });
    data.answers.forEach((a) => {
      w.need(70);
      w.text(`Q: ${a.question}`, { font: w.bold, size: 10 });
      w.text(`Saved ${fmtDate(a.askedAt)}${a.sources.length > 0 ? ` - sources: ${a.sources.slice(0, 3).join(", ")}${a.sources.length > 3 ? ` and ${a.sources.length - 3} more` : ""}` : ""}`, { size: 8, color: MUTED });
      w.gap(2);
      w.text(clip(stripMarkdown(a.answer), 900), { size: 9.5 });
      w.gap(10);
    });
  }

  if (options.aiUsage) {
    const u = data.aiUsage;
    w.heading("AI usage");
    if (u.calls === 0) w.text("No model calls have been recorded for this repository yet.", { color: MUTED });
    else {
      w.tiles([
        { value: fmtNum(u.calls), label: "Model calls" },
        { value: fmtNum(u.promptTokens + u.completionTokens), label: `Tokens (${fmtNum(u.promptTokens)} in, ${fmtNum(u.completionTokens)} out)` },
        { value: u.avgTokensPerSecond != null ? `${u.avgTokensPerSecond} tok/s` : "n/a", label: "Average writing speed" },
        { value: fmtMs(u.avgLatencyMs), label: "Average latency" },
        { value: fmtNum(u.errors), label: "Failed calls" },
      ]);
      if (u.models.length > 0) {
        w.subheading("By model");
        w.table(
          [{ header: "Model", weight: 4, mono: true }, { header: "Runs", weight: 1.6 }, { header: "Calls", weight: 1 }, { header: "Speed", weight: 1.4 }, { header: "Latency", weight: 1.4 }],
          u.models.slice(0, 10).map((m) => [m.model, m.provider === "ollama" ? "On this computer" : `Cloud (${m.provider})`, String(m.calls), m.avgTokensPerSecond != null ? `${m.avgTokensPerSecond} tok/s` : "n/a", fmtMs(m.avgLatencyMs)]),
        );
      }
    }
  }

  w.footers();
  return doc.save();
}
