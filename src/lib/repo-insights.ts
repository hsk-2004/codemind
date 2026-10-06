export interface LanguageStat {
  language: string;
  files: number;
  percent: number;
}

export interface DetectedItem {
  name: string;
  files: string[];
}

export interface RepoInsights {
  totalFiles: number;
  languages: LanguageStat[];
  docker: { dockerfiles: string[]; compose: string[] };
  ci: DetectedItem[];
  dependencies: DetectedItem[];
  tests: { frameworks: DetectedItem[]; testFiles: number };
  suggestions: string[];
}

const LANGUAGES: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
  py: "Python", java: "Java", kt: "Kotlin", go: "Go", rs: "Rust", rb: "Ruby", php: "PHP", cs: "C#",
  c: "C", h: "C", cpp: "C++", cc: "C++", hpp: "C++", swift: "Swift", scala: "Scala", dart: "Dart",
  vue: "Vue", svelte: "Svelte", html: "HTML", css: "CSS", scss: "SCSS", sql: "SQL", sh: "Shell",
};

const IGNORED_DIRS = /(^|\/)(node_modules|\.git|dist|build|\.next|vendor|__pycache__|\.venv|venv|coverage)\//;

const CI_RULES: { name: string; match: (p: string) => boolean }[] = [
  { name: "GitHub Actions", match: (p) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(p) },
  { name: "GitLab CI", match: (p) => p === ".gitlab-ci.yml" },
  { name: "Jenkins", match: (p) => /(^|\/)Jenkinsfile$/.test(p) },
  { name: "CircleCI", match: (p) => p === ".circleci/config.yml" },
  { name: "Azure Pipelines", match: (p) => p === "azure-pipelines.yml" },
];

const DEPENDENCY_RULES: { name: string; match: (p: string) => boolean }[] = [
  { name: "Node.js (npm)", match: (p) => /(^|\/)package\.json$/.test(p) },
  { name: "Python", match: (p) => /(^|\/)(requirements[^/]*\.txt|pyproject\.toml|Pipfile|setup\.py)$/.test(p) },
  { name: "Java (Maven)", match: (p) => /(^|\/)pom\.xml$/.test(p) },
  { name: "Java/Kotlin (Gradle)", match: (p) => /(^|\/)build\.gradle(\.kts)?$/.test(p) },
  { name: "Go modules", match: (p) => /(^|\/)go\.mod$/.test(p) },
  { name: "Rust (Cargo)", match: (p) => /(^|\/)Cargo\.toml$/.test(p) },
  { name: "Ruby (Bundler)", match: (p) => /(^|\/)Gemfile$/.test(p) },
  { name: "PHP (Composer)", match: (p) => /(^|\/)composer\.json$/.test(p) },
];

const TEST_FRAMEWORK_RULES: { name: string; match: (p: string) => boolean }[] = [
  { name: "Vitest", match: (p) => /(^|\/)vitest(\.[a-z]+)?\.config\.[cm]?[jt]s$/.test(p) },
  { name: "Jest", match: (p) => /(^|\/)jest\.config\.[cm]?[jt]s(on)?$/.test(p) },
  { name: "Playwright", match: (p) => /(^|\/)playwright\.config\.[cm]?[jt]s$/.test(p) },
  { name: "Cypress", match: (p) => /(^|\/)cypress\.config\.[cm]?[jt]s$/.test(p) },
  { name: "Pytest", match: (p) => /(^|\/)(pytest\.ini|conftest\.py)$/.test(p) },
  { name: "JUnit", match: (p) => /src\/test\/java\/.+\.java$/.test(p) },
];

const TEST_FILE = /(\.(test|spec)\.[cm]?[jt]sx?$)|((^|\/)test_[^/]+\.py$)|(_test\.(py|go)$)|((^|\/)__tests__\/)/;

function collect(paths: string[], rules: { name: string; match: (p: string) => boolean }[]): DetectedItem[] {
  return rules
    .map((rule) => ({ name: rule.name, files: paths.filter(rule.match) }))
    .filter((item) => item.files.length > 0);
}

/** Derives repository facts from its file paths alone (no file contents needed). */
export function analyzeRepoTree(allPaths: string[]): RepoInsights {
  const paths = allPaths.filter((p) => !IGNORED_DIRS.test(p));

  const counts = new Map<string, number>();
  for (const path of paths) {
    const ext = path.split("/").pop()?.split(".").slice(1).pop()?.toLowerCase();
    const language = ext ? LANGUAGES[ext] : undefined;
    if (language) counts.set(language, (counts.get(language) ?? 0) + 1);
  }
  const codeFiles = [...counts.values()].reduce((a, b) => a + b, 0);
  const languages = [...counts.entries()]
    .map(([language, files]) => ({ language, files, percent: codeFiles ? Math.round((files / codeFiles) * 1000) / 10 : 0 }))
    .sort((a, b) => b.files - a.files);

  const dockerfiles = paths.filter((p) => /(^|\/)Dockerfile(\.[\w-]+)?$/.test(p));
  const compose = paths.filter((p) => /(^|\/)(docker-)?compose(\.[\w-]+)?\.ya?ml$/.test(p));
  const ci = collect(paths, CI_RULES);
  const dependencies = collect(paths, DEPENDENCY_RULES);
  const frameworks = collect(paths, TEST_FRAMEWORK_RULES);
  const testFiles = paths.filter((p) => TEST_FILE.test(p)).length;

  const suggestions: string[] = [];
  if (dockerfiles.length === 0) suggestions.push("No Dockerfile found — containerising the app would make builds reproducible.");
  if (ci.length === 0) suggestions.push("No CI/CD pipeline detected — add a GitHub Actions workflow to build and test every push.");
  if (testFiles === 0 && frameworks.length === 0) suggestions.push("No automated tests detected.");
  if (dockerfiles.length > 0 && compose.length === 0) suggestions.push("Dockerfile present but no Compose file for local multi-service setup.");

  return {
    totalFiles: paths.length,
    languages,
    docker: { dockerfiles, compose },
    ci,
    dependencies,
    tests: { frameworks, testFiles },
    suggestions,
  };
}
