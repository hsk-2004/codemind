import { describe, expect, it } from "vitest";
import { analyzeRepoTree } from "@/lib/repo-insights";

const FULL_STACK_REPO = [
  "package.json",
  "Dockerfile",
  "docker-compose.yml",
  ".github/workflows/ci.yml",
  ".github/workflows/cd.yaml",
  "vitest.config.ts",
  "src/index.ts",
  "src/app.tsx",
  "src/utils.ts",
  "src/app.test.ts",
  "backend/requirements.txt",
  "backend/main.py",
  "backend/tests/test_auth.py",
  "node_modules/react/index.js",
  "dist/bundle.js",
  "README.md",
];

describe("analyzeRepoTree", () => {
  const insights = analyzeRepoTree(FULL_STACK_REPO);

  it("ignores dependency and build directories", () => {
    expect(insights.totalFiles).toBe(14);
  });

  it("computes the language breakdown, most common first", () => {
    expect(insights.languages[0]).toEqual({ language: "TypeScript", files: 5, percent: 71.4 });
    expect(insights.languages[1]).toEqual({ language: "Python", files: 2, percent: 28.6 });
    expect(insights.languages.find((l) => l.language === "JavaScript")).toBeUndefined();
  });

  it("detects Docker and Compose", () => {
    expect(insights.docker).toEqual({ dockerfiles: ["Dockerfile"], compose: ["docker-compose.yml"] });
  });

  it("detects GitHub Actions workflows", () => {
    expect(insights.ci).toEqual([
      { name: "GitHub Actions", files: [".github/workflows/ci.yml", ".github/workflows/cd.yaml"] },
    ]);
  });

  it("detects dependency ecosystems in subfolders", () => {
    expect(insights.dependencies.map((d) => d.name)).toEqual(["Node.js (npm)", "Python"]);
  });

  it("detects test frameworks and counts test files", () => {
    expect(insights.tests.frameworks.map((f) => f.name)).toEqual(["Vitest"]);
    expect(insights.tests.testFiles).toBe(2);
  });

  it("makes no suggestions for a well-equipped repo", () => {
    expect(insights.suggestions).toEqual([]);
  });

  it("suggests improvements for a bare repo", () => {
    const bare = analyzeRepoTree(["index.js", "package.json"]);
    expect(bare.ci).toEqual([]);
    expect(bare.suggestions).toHaveLength(3);
    expect(bare.suggestions.join(" ")).toMatch(/Dockerfile/);
    expect(bare.suggestions.join(" ")).toMatch(/CI\/CD/);
    expect(bare.suggestions.join(" ")).toMatch(/tests/);
  });

  it("handles an empty repository", () => {
    const empty = analyzeRepoTree([]);
    expect(empty.totalFiles).toBe(0);
    expect(empty.languages).toEqual([]);
  });

  it("detects Jenkins, GitLab CI and Maven", () => {
    const javaRepo = analyzeRepoTree(["Jenkinsfile", ".gitlab-ci.yml", "pom.xml", "src/test/java/AppTest.java"]);
    expect(javaRepo.ci.map((c) => c.name).sort()).toEqual(["GitLab CI", "Jenkins"]);
    expect(javaRepo.dependencies.map((d) => d.name)).toEqual(["Java (Maven)"]);
    expect(javaRepo.tests.frameworks.map((f) => f.name)).toEqual(["JUnit"]);
  });
});
