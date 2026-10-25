# AI test generation with Qodo (CodiumAI)

A2 asks for test generation with CodiumAI/Codeium. CodiumAI is now **Qodo**. This page gives the steps, so the evidence (screenshots, commits) comes from the real tool.

## Where to run it

CodeMind's unit tests live in `tests/unit` (Vitest). Good targets are small, pure modules with clear inputs and outputs:

| Module | Existing test | What to ask Qodo for |
|---|---|---|
| `src/services/rag/fusion.ts` | `tests/unit/fusion.test.ts` | Extra edge cases for `keywordTerms` |
| `src/lib/github-webhook.ts` | `tests/unit/github-webhook.test.ts` | Malformed payloads and signatures |
| `src/services/rag/eval-metrics.ts` | `tests/unit/eval-metrics.test.ts` | Ties, duplicate files, k larger than results |
| `src/services/rag/escalation.ts` | `tests/unit/escalation.test.ts` | Boundary cases |

## Option A: Qodo Gen in VS Code

1. Install **Qodo Gen** from the VS Code marketplace and sign in.
2. Open a target file, right-click a function and choose **Qodo Gen: Test this function**.
3. Review the generated cases. Keep the ones that add coverage, delete duplicates, and fix any that assert the wrong behaviour.
4. Save them in `tests/unit/<module>.generated.test.ts`, run `npm test`, and take a screenshot of the Qodo panel and the passing run.

## Option B: Qodo Cover (command line)

```bash
pip install qodo-cover
qodo-cover \
  --source-file-path src/services/rag/fusion.ts \
  --test-file-path tests/unit/fusion.test.ts \
  --test-command "npx vitest run tests/unit/fusion.test.ts --coverage" \
  --code-coverage-report-path coverage/cobertura-coverage.xml \
  --desired-coverage 95
```

It needs a model key (for example `GEMINI_API_KEY` or `OPENAI_API_KEY`) and a coverage reporter (`@vitest/coverage-v8`). Check `qodo-cover --help` for the flags in your installed version.

## Qodo on every pull request

`.github/workflows/qodo-pr-agent.yml` runs Qodo PR-Agent on each pull request. It describes the change, reviews the diff and suggests improvements, including missing tests. Add a `GEMINI_API_KEY` repository secret to turn it on. Settings are in `.pr_agent.toml`.

## Evidence to keep for the evaluation

- Screenshot of Qodo generating tests for one module.
- The commit that adds the reviewed tests.
- The passing `npm test` run (the repo has 137 unit tests).
- A short note on what Qodo got wrong and what you corrected, which shows you understood the tests.
