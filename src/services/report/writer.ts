import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { clip, toWinAnsi, wrapText } from "./pdf-text";

// A4 in points, with 48 pt margins.
export const W = 595.28;
export const H = 841.89;
export const M = 48;
export const CONTENT_W = W - 2 * M;

export const INK = rgb(0.12, 0.16, 0.2);
export const MUTED = rgb(0.38, 0.44, 0.5);
export const ACCENT = rgb(0.11, 0.31, 0.85);
export const TINT = rgb(0.93, 0.95, 1);
export const RULE = rgb(0.8, 0.83, 0.86);
export const SEVERITY = { critical: rgb(0.75, 0.1, 0.1), high: rgb(0.85, 0.35, 0.1), medium: rgb(0.8, 0.6, 0.05), low: rgb(0.2, 0.55, 0.3) } as Record<string, ReturnType<typeof rgb>>;
export const BAR_COLORS = [rgb(0.22, 0.74, 0.97), rgb(0.96, 0.62, 0.04), rgb(0.2, 0.83, 0.6), rgb(0.65, 0.55, 0.98), rgb(0.6, 0.65, 0.7)];


/** Draws onto A4 pages, starting a new page whenever the next block does not fit. */
export class Writer {
  page!: PDFPage;
  y = 0;
  pageNumber = 0;
  /** Every heading written, with its page, so a table of contents can be built. */
  headings: { level: 1 | 2; text: string; page: number }[] = [];

  constructor(
    readonly doc: PDFDocument,
    readonly regular: PDFFont,
    readonly bold: PDFFont,
    readonly mono: PDFFont,
    readonly title: string,
  ) {
    this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage([W, H]);
    this.pageNumber += 1;
    this.y = H - M;
    if (this.pageNumber > 1) {
      this.page.drawText(toWinAnsi(this.title), { x: M, y: H - 30, size: 8, font: this.regular, color: MUTED });
      this.page.drawLine({ start: { x: M, y: H - 36 }, end: { x: W - M, y: H - 36 }, thickness: 0.5, color: RULE });
      this.y = H - M - 8;
    }
  }

  /** Makes room for a block `height` tall, moving to a new page if needed. */
  need(height: number) {
    if (this.y - height < M + 14) this.newPage();
  }

  gap(points: number) {
    this.y -= points;
  }

  measure(font: PDFFont, size: number) {
    return (s: string) => font.widthOfTextAtSize(toWinAnsi(s), size);
  }

  /** Wrapped text. Returns the height used. */
  text(raw: string, opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; x?: number; width?: number; leading?: number; keepTogether?: boolean } = {}) {
    const size = opts.size ?? 10;
    const font = opts.font ?? this.regular;
    const x = opts.x ?? M;
    const width = opts.width ?? CONTENT_W - (x - M);
    const leading = opts.leading ?? size * 1.4;
    const lines = wrapText(toWinAnsi(raw), width, this.measure(font, size));
    if (opts.keepTogether) this.need(lines.length * leading);
    for (const line of lines) {
      this.need(leading);
      if (line) this.page.drawText(line, { x, y: this.y - size, size, font, color: opts.color ?? INK });
      this.y -= leading;
    }
    return lines.length * leading;
  }

  heading(label: string) {
    this.need(48);
    this.gap(14);
    this.page.drawText(toWinAnsi(label), { x: M, y: this.y - 14, size: 14, font: this.bold, color: ACCENT });
    this.y -= 20;
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: W - M, y: this.y }, thickness: 0.7, color: ACCENT });
    this.y -= 10;
  }

  subheading(label: string) {
    this.need(30);
    this.gap(4);
    this.text(label, { font: this.bold, size: 10.5 });
    this.gap(2);
  }

  /** A row of equally wide tiles, each a big number over a small label. */
  tiles(items: { value: string; label: string }[], perRow = 3) {
    const gapX = 10;
    const tileW = (CONTENT_W - gapX * (perRow - 1)) / perRow;
    const tileH = 50;
    for (let i = 0; i < items.length; i += perRow) {
      this.need(tileH + 8);
      items.slice(i, i + perRow).forEach((item, col) => {
        const x = M + col * (tileW + gapX);
        this.page.drawRectangle({ x, y: this.y - tileH, width: tileW, height: tileH, color: TINT, borderColor: RULE, borderWidth: 0.5 });
        this.page.drawText(toWinAnsi(item.value), { x: x + 10, y: this.y - 24, size: 17, font: this.bold, color: INK });
        this.page.drawText(toWinAnsi(clip(item.label, 38)), { x: x + 10, y: this.y - 40, size: 8, font: this.regular, color: MUTED });
      });
      this.y -= tileH + 8;
    }
  }

  /** A horizontal bar for each item, scaled to the largest value. */
  bars(items: { label: string; value: number; note: string }[]) {
    const labelW = 100;
    const noteW = 80;
    const barX = M + labelW + 6;
    const barMax = CONTENT_W - labelW - noteW - 12;
    const max = Math.max(...items.map((i) => i.value), 1);
    items.forEach((item, index) => {
      this.need(18);
      this.page.drawText(toWinAnsi(clip(item.label, 22)), { x: M, y: this.y - 10, size: 9, font: this.regular, color: INK });
      this.page.drawRectangle({ x: barX, y: this.y - 12, width: barMax, height: 9, color: rgb(0.93, 0.94, 0.96) });
      this.page.drawRectangle({ x: barX, y: this.y - 12, width: Math.max(2, (item.value / max) * barMax), height: 9, color: BAR_COLORS[index % BAR_COLORS.length]! });
      this.page.drawText(toWinAnsi(item.note), { x: barX + barMax + 8, y: this.y - 10, size: 8.5, font: this.regular, color: MUTED });
      this.y -= 18;
    });
  }

  /** A table whose columns are given as relative widths. Rows wrap and never split across pages. */
  table(columns: { header: string; weight: number; mono?: boolean }[], rows: string[][]) {
    const total = columns.reduce((n, c) => n + c.weight, 0);
    const widths = columns.map((c) => (c.weight / total) * CONTENT_W);
    const size = 8.5;
    const leading = 11.5;
    const pad = 4;

    const header = () => {
      this.need(24);
      this.page.drawRectangle({ x: M, y: this.y - 18, width: CONTENT_W, height: 18, color: ACCENT });
      let x = M;
      columns.forEach((c, i) => {
        this.page.drawText(toWinAnsi(c.header), { x: x + pad, y: this.y - 12.5, size, font: this.bold, color: rgb(1, 1, 1) });
        x += widths[i]!;
      });
      this.y -= 18;
    };
    header();

    rows.forEach((row, rowIndex) => {
      const cells = row.map((cell, i) => wrapText(toWinAnsi(cell), widths[i]! - 2 * pad, this.measure(columns[i]!.mono ? this.mono : this.regular, size)));
      const height = Math.max(...cells.map((c) => c.length)) * leading + 2 * pad;
      if (this.y - height < M + 14) {
        this.newPage();
        header();
      }
      if (rowIndex % 2 === 1) this.page.drawRectangle({ x: M, y: this.y - height, width: CONTENT_W, height, color: rgb(0.97, 0.975, 0.985) });
      let x = M;
      cells.forEach((lines, i) => {
        lines.forEach((line, n) => {
          if (line) this.page.drawText(line, { x: x + pad, y: this.y - pad - size - n * leading + 1, size, font: columns[i]!.mono ? this.mono : this.regular, color: INK });
        });
        x += widths[i]!;
      });
      this.y -= height;
      this.page.drawLine({ start: { x: M, y: this.y }, end: { x: W - M, y: this.y }, thickness: 0.3, color: RULE });
    });
    this.gap(8);
  }


  /** Large section title that starts a new page. */
  h1(label: string) {
    if (this.y < H - M - 20) this.newPage();
    this.headings.push({ level: 1, text: label, page: this.pageNumber });
    this.page.drawRectangle({ x: M, y: this.y - 34, width: 5, height: 30, color: ACCENT });
    this.page.drawText(toWinAnsi(label), { x: M + 14, y: this.y - 26, size: 20, font: this.bold, color: INK });
    this.y -= 52;
  }

  h2(label: string) {
    this.need(60);
    this.gap(10);
    this.headings.push({ level: 2, text: label, page: this.pageNumber });
    this.page.drawText(toWinAnsi(label), { x: M, y: this.y - 13, size: 13.5, font: this.bold, color: ACCENT });
    this.y -= 20;
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: W - M, y: this.y }, thickness: 0.5, color: RULE });
    this.y -= 8;
  }

  h3(label: string) {
    // Keep the heading with the table, code box or list that follows it.
    this.need(96);
    this.gap(4);
    this.text(label, { font: this.bold, size: 11, color: INK });
    this.gap(1);
  }

  /** Normal reading text with a little space after it. */
  p(text: string, opts: { size?: number; color?: ReturnType<typeof rgb> } = {}) {
    this.text(text, { size: opts.size ?? 10, leading: (opts.size ?? 10) * 1.5, color: opts.color });
    this.gap(5);
  }

  bullets(items: string[], opts: { size?: number; indent?: number } = {}) {
    const size = opts.size ?? 10;
    const indent = opts.indent ?? 14;
    for (const item of items) {
      const lines = wrapText(toWinAnsi(item), CONTENT_W - indent - 4, this.measure(this.regular, size));
      this.need(Math.min(lines.length, 3) * size * 1.5);
      this.page.drawCircle({ x: M + 5, y: this.y - size * 0.62, size: 1.6, color: ACCENT });
      lines.forEach((line) => {
        this.need(size * 1.5);
        if (line) this.page.drawText(line, { x: M + indent, y: this.y - size, size, font: this.regular, color: INK });
        this.y -= size * 1.5;
      });
      this.y -= 2;
    }
    this.gap(4);
  }

  numbered(items: string[], opts: { size?: number } = {}) {
    const size = opts.size ?? 10;
    items.forEach((item, index) => {
      const lines = wrapText(toWinAnsi(item), CONTENT_W - 22, this.measure(this.regular, size));
      this.need(Math.min(lines.length, 3) * size * 1.5);
      this.page.drawText(`${index + 1}.`, { x: M, y: this.y - size, size, font: this.bold, color: ACCENT });
      lines.forEach((line) => {
        this.need(size * 1.5);
        if (line) this.page.drawText(line, { x: M + 22, y: this.y - size, size, font: this.regular, color: INK });
        this.y -= size * 1.5;
      });
      this.y -= 2;
    });
    this.gap(4);
  }

  /** A shaded box with a coloured edge, for a definition, a tip or a warning. */
  callout(title: string, text: string, tone: "info" | "tip" | "warn" | "key" = "info") {
    const palette = {
      info: { bar: ACCENT, bg: rgb(0.93, 0.95, 1) },
      tip: { bar: rgb(0.1, 0.6, 0.4), bg: rgb(0.92, 0.98, 0.95) },
      warn: { bar: rgb(0.85, 0.5, 0.05), bg: rgb(1, 0.96, 0.9) },
      key: { bar: rgb(0.45, 0.3, 0.85), bg: rgb(0.95, 0.93, 1) },
    }[tone];
    const size = 9.5;
    const pad = 9;
    const lines = wrapText(toWinAnsi(text), CONTENT_W - 2 * pad - 6, this.measure(this.regular, size));
    const height = pad * 2 + (title ? 15 : 0) + lines.length * 13.5;
    this.need(height + 8);
    this.page.drawRectangle({ x: M, y: this.y - height, width: CONTENT_W, height, color: palette.bg });
    this.page.drawRectangle({ x: M, y: this.y - height, width: 3.5, height, color: palette.bar });
    let y = this.y - pad;
    if (title) {
      this.page.drawText(toWinAnsi(title), { x: M + pad + 3, y: y - 10, size: 10, font: this.bold, color: palette.bar });
      y -= 15;
    }
    lines.forEach((line) => {
      if (line) this.page.drawText(line, { x: M + pad + 3, y: y - size, size, font: this.regular, color: INK });
      y -= 13.5;
    });
    this.y -= height + 9;
  }

  code(lines: string[]) {
    const size = 8.5;
    const leading = 11.5;
    const pad = 7;
    const wrapped = lines.flatMap((l) => wrapText(toWinAnsi(l) || " ", CONTENT_W - 2 * pad, this.measure(this.mono, size)));
    const height = wrapped.length * leading + 2 * pad;
    this.need(height + 8);
    this.page.drawRectangle({ x: M, y: this.y - height, width: CONTENT_W, height, color: rgb(0.95, 0.96, 0.97), borderColor: RULE, borderWidth: 0.5 });
    wrapped.forEach((line, i) => {
      if (line.trim()) this.page.drawText(line, { x: M + pad, y: this.y - pad - size - i * leading + 1, size, font: this.mono, color: INK });
    });
    this.y -= height + 9;
  }

  private arrowDown(x: number, y: number, length: number) {
    this.page.drawLine({ start: { x, y }, end: { x, y: y - length }, thickness: 1.2, color: ACCENT });
    this.page.drawLine({ start: { x, y: y - length }, end: { x: x - 3.5, y: y - length + 5 }, thickness: 1.2, color: ACCENT });
    this.page.drawLine({ start: { x, y: y - length }, end: { x: x + 3.5, y: y - length + 5 }, thickness: 1.2, color: ACCENT });
  }

  /** Numbered boxes joined by arrows: the steps of something that happens in order. */
  flow(steps: { title: string; text: string }[]) {
    const size = 9;
    const pad = 8;
    steps.forEach((step, index) => {
      const lines = wrapText(toWinAnsi(step.text), CONTENT_W - 50 - pad, this.measure(this.regular, size));
      const height = pad * 2 + 14 + lines.length * 12.5;
      const before = this.pageNumber;
      this.need(height + 16);
      if (index > 0 && this.pageNumber === before) this.arrowDown(M + 16, this.y + 14, 12);
      this.page.drawRectangle({ x: M, y: this.y - height, width: CONTENT_W, height, color: rgb(0.97, 0.975, 0.99), borderColor: RULE, borderWidth: 0.6 });
      this.page.drawCircle({ x: M + 16, y: this.y - height / 2, size: 9.5, color: ACCENT });
      const n = String(index + 1);
      this.page.drawText(n, { x: M + 16 - this.bold.widthOfTextAtSize(n, 9.5) / 2, y: this.y - height / 2 - 3.4, size: 9.5, font: this.bold, color: rgb(1, 1, 1) });
      this.page.drawText(toWinAnsi(step.title), { x: M + 36, y: this.y - pad - 10, size: 10.5, font: this.bold, color: INK });
      lines.forEach((line, i) => {
        if (line) this.page.drawText(line, { x: M + 36, y: this.y - pad - 14 - size - i * 12.5 + 2, size, font: this.regular, color: INK });
      });
      this.y -= height + 14;
    });
    this.gap(2);
  }

  /** Boxes in a row with arrows between them: a short pipeline read left to right. */
  pipeline(items: string[], perRow = 4) {
    const size = 8.5;
    const gapX = 20;
    const boxW = (CONTENT_W - gapX * (perRow - 1)) / perRow;
    for (let start = 0; start < items.length; start += perRow) {
      const row = items.slice(start, start + perRow);
      const wrapped = row.map((label) => wrapText(toWinAnsi(label), boxW - 14, this.measure(this.bold, size)));
      const height = Math.max(...wrapped.map((l) => l.length)) * 11 + 24;
      this.need(height + 12);
      row.forEach((_, col) => {
        const x = M + col * (boxW + gapX);
        this.page.drawRectangle({ x, y: this.y - height, width: boxW, height, color: TINT, borderColor: ACCENT, borderWidth: 0.8 });
        this.page.drawText(String(start + col + 1), { x: x + 6, y: this.y - 11, size: 8, font: this.bold, color: ACCENT });
        wrapped[col]!.forEach((line, i) => {
          const width = this.bold.widthOfTextAtSize(line, size);
          this.page.drawText(line, { x: x + (boxW - width) / 2, y: this.y - 20 - size - i * 11 + 4, size, font: this.bold, color: INK });
        });
        if (col < row.length - 1) {
          const ax = x + boxW + 3;
          const ay = this.y - height / 2;
          this.page.drawLine({ start: { x: ax, y: ay }, end: { x: ax + gapX - 6, y: ay }, thickness: 1.2, color: ACCENT });
          this.page.drawLine({ start: { x: ax + gapX - 6, y: ay }, end: { x: ax + gapX - 11, y: ay + 3.5 }, thickness: 1.2, color: ACCENT });
          this.page.drawLine({ start: { x: ax + gapX - 6, y: ay }, end: { x: ax + gapX - 11, y: ay - 3.5 }, thickness: 1.2, color: ACCENT });
        }
      });
      this.y -= height + 12;
    }
  }

  /** Stacked bands for the layers of a system, top to bottom. */
  layers(items: { name: string; text: string; color?: ReturnType<typeof rgb> }[]) {
    const size = 9;
    items.forEach((item, index) => {
      const lines = wrapText(toWinAnsi(item.text), CONTENT_W - 130, this.measure(this.regular, size));
      const height = Math.max(34, lines.length * 12.5 + 14);
      this.need(height + 14);
      const color = item.color ?? BAR_COLORS[index % BAR_COLORS.length]!;
      this.page.drawRectangle({ x: M, y: this.y - height, width: CONTENT_W, height, color: rgb(0.97, 0.975, 0.985), borderColor: RULE, borderWidth: 0.6 });
      this.page.drawRectangle({ x: M, y: this.y - height, width: 112, height, color });
      const nameLines = wrapText(toWinAnsi(item.name), 98, this.measure(this.bold, 9.5));
      nameLines.forEach((line, i) => this.page.drawText(line, { x: M + 8, y: this.y - height / 2 + (nameLines.length - 1) * 5.5 - i * 11 - 3, size: 9.5, font: this.bold, color: rgb(0.08, 0.1, 0.14) }));
      lines.forEach((line, i) => this.page.drawText(line, { x: M + 122, y: this.y - 10 - size - i * 12.5 + 3, size, font: this.regular, color: INK }));
      this.y -= height;
      if (index < items.length - 1) {
        this.arrowDown(M + 56, this.y, 10);
        this.y -= 10;
      }
    });
    this.gap(10);
  }

  /** Writes a contents list from headings collected in an earlier pass. */
  contents(entries: { level: 1 | 2; text: string; page: number }[]) {
    for (const entry of entries) {
      this.need(18);
      const size = entry.level === 1 ? 10.5 : 9;
      const x = M + (entry.level === 1 ? 0 : 16);
      const font = entry.level === 1 ? this.bold : this.regular;
      const label = toWinAnsi(entry.text);
      this.page.drawText(label, { x, y: this.y - size, size, font, color: entry.level === 1 ? INK : MUTED });
      const pageText = String(entry.page);
      const pageWidth = font.widthOfTextAtSize(pageText, size);
      const labelWidth = font.widthOfTextAtSize(label, size);
      // dotted leader
      const dots = Math.floor((CONTENT_W - (x - M) - labelWidth - pageWidth - 14) / 3);
      if (dots > 0) this.page.drawText(".".repeat(dots), { x: x + labelWidth + 6, y: this.y - size, size: 8, font: this.regular, color: RULE });
      this.page.drawText(pageText, { x: W - M - pageWidth, y: this.y - size, size, font, color: INK });
      this.y -= entry.level === 1 ? 17 : 14;
    }
  }

  footers() {
    const pages = this.doc.getPages();
    pages.forEach((page, i) => {
      page.drawText(`Page ${i + 1} of ${pages.length}`, { x: W - M - 50, y: 26, size: 8, font: this.regular, color: MUTED });
      page.drawText("Generated by CodeMind", { x: M, y: 26, size: 8, font: this.regular, color: MUTED });
    });
  }
}

