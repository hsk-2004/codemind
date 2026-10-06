import { describe, expect, it } from "vitest";
import { MAX_INDEXABLE_CHARS, isIndexableFile } from "@/lib/file-selection";

describe("isIndexableFile", () => {
  it.each([
    "src/main.js",
    "src/app/page.tsx",
    "backend/auth.py",
    "README.md",
    "package.json",
    "Dockerfile",
    "src/style.css",
    ".github/workflows/ci.yml",
    ".gitignore",
    "docs/build-guide.md",
  ])("indexes %s", (path) => {
    expect(isIndexableFile(path, 500)).toBe(true);
  });

  it.each([
    "public/favicon.svg",
    "src/assets/logo.PNG",
    "fonts/inter.woff2",
    "dist/bundle.js",
    "node_modules/react/index.js",
    ".git/config",
    "app/build/output.js",
    "package-lock.json",
    "vendor/lib.min.js",
    "static/app.js.map",
    "yarn.lock",
  ])("skips %s", (path) => {
    expect(isIndexableFile(path, 500)).toBe(false);
  });

  it("skips empty files and files over the size limit", () => {
    expect(isIndexableFile("src/empty.ts", 0)).toBe(false);
    expect(isIndexableFile("src/huge.ts", MAX_INDEXABLE_CHARS + 1)).toBe(false);
    expect(isIndexableFile("src/ok.ts", MAX_INDEXABLE_CHARS)).toBe(true);
  });
});
