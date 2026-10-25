/**
 * Builds the CodeMind study guide PDF (docs/CodeMind-Study-Guide.pdf).
 * Usage: npm run guide
 */
import { writeFileSync } from "node:fs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { Writer } from "../src/services/report/writer";
import { cover, part1, part2, part3 } from "./study-guide/part1";
import { part4 } from "./study-guide/part2";
import { part5, part6, part7, part8 } from "./study-guide/part3";
import { part10, part11, part12, part9 } from "./study-guide/part4";

type Heading = Writer["headings"][number];

async function build(toc: Heading[]): Promise<{ bytes: Uint8Array; headings: Heading[] }> {
  const doc = await PDFDocument.create();
  doc.setTitle("CodeMind study guide");
  doc.setAuthor("CodeMind");
  const w = new Writer(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold), await doc.embedFont(StandardFonts.Courier), "CodeMind study guide");

  cover(w);
  w.newPage();
  w.text("Contents", { font: w.bold, size: 20 });
  w.gap(10);
  w.contents(toc);

  for (const part of [part1, part2, part3, part4, part5, part6, part7, part8, part9, part10, part11, part12]) part(w);
  w.footers();
  return { bytes: await doc.save(), headings: w.headings };
}

// Pass 1 counts the headings, pass 2 fixes the page numbers, pass 3 prints them. The contents list has the same
// number of lines every time, so the pages do not move between passes 2 and 3.
const first = await build([]);
const second = await build(first.headings.map((h) => ({ ...h, page: 0 })));
const final = await build(second.headings);
writeFileSync("docs/CodeMind-Study-Guide.pdf", final.bytes);
console.log(`docs/CodeMind-Study-Guide.pdf  ${(final.bytes.length / 1024).toFixed(0)} KB, ${final.headings.length} headings`);
