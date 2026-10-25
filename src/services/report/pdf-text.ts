/**
 * PDF's built-in fonts only cover Western European text (WinAnsi). Anything else
 * would make the PDF library throw, so unsupported characters are swapped for a
 * close, readable equivalent before drawing.
 */
const REPLACEMENTS: Record<string, string> = {
  "→": "->", "←": "<-", "↔": "<->", "⇒": "=>",
  "≈": "~", "≤": "<=", "≥": ">=", "≠": "!=", "×": "x",
  "✓": "yes", "✔": "yes", "✗": "no", "✘": "no", "✅": "yes", "❌": "no",
  "‑": "-", "−": "-", " ": " ", "​": "", "️": "", "…": "...",
};

/** Characters the standard Helvetica font can draw (printable Latin-1 plus a few Windows-1252 extras). */
const SUPPORTED_EXTRA = new Set("•–—‘’“”€™…".split(""));

export function toWinAnsi(text: string): string {
  let out = "";
  for (const char of text.normalize("NFC")) {
    const code = char.codePointAt(0)!;
    if (char === "\n" || char === "\t") out += char === "\t" ? "  " : char;
    else if (REPLACEMENTS[char] !== undefined) out += REPLACEMENTS[char];
    else if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa1 && code <= 0xff) || SUPPORTED_EXTRA.has(char)) out += char;
    else if (code < 0x20 || code === 0x7f) out += "";
    else out += "?";
  }
  return out;
}

/** Strips markdown so an AI answer reads as plain text in a PDF. */
export function stripMarkdown(text: string): string {
  return text
    .replace(/```[a-z]*\n?([\s\S]*?)```/gi, (_, code: string) => code.trim())
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(?<![\w*])\*([^*\n]+)\*(?![\w*])/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Cuts a long text at a word boundary and marks the cut. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > max * 0.6 ? space : max).trimEnd()}...`;
}

/**
 * Breaks text into lines no wider than `maxWidth`. `measure` gives the width of a
 * string, so the same function works for any font and size. Explicit line breaks
 * are kept, and a single word wider than the line is split rather than overflowing.
 */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = word;
      // A word wider than the whole line (a long path or URL) is split.
      while (measure(line) > maxWidth && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && measure(line.slice(0, cut)) > maxWidth) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    lines.push(line);
  }
  return lines;
}
