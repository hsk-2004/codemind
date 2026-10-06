/** Largest file (in characters) that is worth sending to the model. */
export const MAX_INDEXABLE_CHARS = 50_000;

/** Binary or generated assets: nothing useful for a code model to summarise. */
const ASSET_EXTENSIONS = [
  ".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".avif",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".mp3", ".mp4", ".wav", ".webm", ".mov",
  ".pdf", ".zip", ".gz", ".tar", ".jar", ".exe", ".dll", ".so", ".bin",
  ".map", ".min.js", ".min.css",
  ".lock", ".log", ".tmp", ".cache",
];

const IGNORED_DIRECTORIES = ["node_modules", ".git", "dist", "build", ".next", "vendor", "__pycache__", "coverage"];

const IGNORED_FILES = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", ".ds_store", "thumbs.db"];

/** Glob patterns for the GitHub loader, so skipped assets are never downloaded. */
export const LOADER_IGNORE_PATTERNS = [
  ...IGNORED_FILES,
  ...ASSET_EXTENSIONS.map((ext) => `*${ext}`),
];

/** Decides whether a repository file should be summarised and embedded. */
export function isIndexableFile(path: string, contentLength: number): boolean {
  if (contentLength === 0 || contentLength > MAX_INDEXABLE_CHARS) return false;

  const lower = path.toLowerCase();
  const segments = lower.split("/");
  const fileName = segments[segments.length - 1] ?? "";

  // Match whole path segments, so ".github/workflows/ci.yml" is not mistaken for ".git".
  if (segments.slice(0, -1).some((dir) => IGNORED_DIRECTORIES.includes(dir))) return false;
  if (IGNORED_FILES.includes(fileName)) return false;
  if (ASSET_EXTENSIONS.some((ext) => fileName.endsWith(ext))) return false;

  return true;
}
