# CodeMind — Mid-Semester Progress Report (A2)

**Course:** CSE 4011 Intelligent Developer Tools and AI DevOps Workflows
**Team:** _<names, roll numbers>_
**Date:** _<date>_

> DRAFT. Rewrite in your own words and fill in the placeholders before submitting.

## 1. Project summary

CodeMind is an AI codebase assistant. It indexes a GitHub repository, answers natural-language questions about it using Retrieval-Augmented Generation (RAG), and analyses commits for breaking changes. All inference runs locally with Ollama, so no source code leaves the developer's machine.

## 2. Progress against the A2 rubric

| Rubric item | Status | Evidence |
|---|---|---|
| RAG-based Q&A bot using LangChain (10%) | Done | `src/services/rag/` — LangChain `RunnableSequence` (`ChatPromptTemplate` → `ChatOllama` → `StringOutputParser`), `OllamaEmbeddings`, pgvector retriever scoped per project. Answers cite source files with relevance scores and decline when evidence is missing. |
| GitHub Actions CI/CD (10%) | Done | `.github/workflows/ci.yml` (lint, type-check, unit and integration tests, build, Docker build), `ai-review.yml` (AI PR review with a local model), `cd.yml` (publishes the Docker image to GHCR). _Sweep.dev: <describe what you set up, or the agreed alternative>._ |
| Test generation with CodiumAI/Codeium (5%) | _<In progress / done>_ | Vitest suite: 34 unit tests plus pgvector integration tests. _<Add which tests were generated with Qodo/CodiumAI or Codeium, with screenshots.>_ |
| Integration quality and documentation (5%) | Done | README covering architecture diagrams, setup, testing, CI/CD, security, limitations. Zero type errors; lint passes. |

## 3. Work completed since Phase 1

1. **Local AI migration.** Replaced Google Gemini with Ollama behind `LLMProvider` and `EmbeddingProvider` interfaces.
2. **Model evaluation.** Compared `qwen3:4b`, `qwen3:1.7b` and `qwen2.5-coder:3b-instruct` on a 4 GB GPU. Selected `qwen2.5-coder:3b-instruct` for its speed, direct answers and full fit in VRAM.
3. **LangChain RAG pipeline.** Separated retrieval from generation, added a context budget for the 3k-token window, honest no-evidence answers, and relevance scores in the UI.
4. **Simplified access.** Removed the third-party sign-in service. The app now runs as a single built-in local user, and every vector search is still scoped to one repository.
5. **Bug fixes found by tests.** Fallback diff summaries counted diff headers as changes and listed one file twice. GitHub URLs with a trailing `/` or `.git` failed to parse.
6. **Infrastructure.** Multi-stage, non-root Docker image; Docker Compose for the app, PostgreSQL/pgvector and Qdrant; CI/CD on GitHub Actions.

## 4. Challenges

- **Reasoning-model leakage.** Qwen3 models spent their token budget on internal reasoning and returned empty output, which broke vector storage, or printed their reasoning as the answer. Solved by choosing a non-reasoning, code-specialised model.
- **Invalid JSON from the model.** Solved with Ollama's grammar-constrained JSON mode and valid in-prompt examples.
- **Hardware limits.** A 4 GB GPU limits model size. Larger models spill into system RAM and slow down sharply.

## 5. Revised plan (remaining weeks)

| Week | Planned work |
|---|---|
| _<wk>_ | Function-level chunking with Tree-sitter; move retrieval to Qdrant |
| _<wk>_ | Background indexing with progress; streaming answers |
| _<wk>_ | Semantic search page; code explainer and test-generation features |
| _<wk>_ | Evaluation lab: fixed vs function-aware chunking, keyword vs vector vs hybrid retrieval |
| _<wk>_ | Final report, presentation, demo |

## 6. Individual contributions

| Member | Contribution |
|---|---|
| _<name>_ | _<...>_ |
