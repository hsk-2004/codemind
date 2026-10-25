# A2 evaluation: rubric, evidence and what is new

Focus of A2: integration of AI tools, code retrieval and automation workflows.

## Rubric mapping

| Rubric item | Weight | Evidence in the repo | How to show it |
|---|---|---|---|
| RAG Q&A bot with LangChain | 10% | `src/services/rag/chain.ts` (`RunnableSequence`: prompt → model → parser), `retriever.ts` (pgvector, function-level chunks, optional hybrid), `src/services/embedding` (`OllamaEmbeddings`), `src/services/llm/langchain.ts` | Ask a question in the app: show sources with line ranges and scores, then the RAG on / off / compare modes |
| GitHub Actions CI/CD with Sweep.dev | 10% | `ci.yml` (lint, types, unit and integration tests, build, Docker), `cd.yml` (image to GHCR), `ai-review.yml` (local-model review of every PR), `sweep.yaml` + `.github/ISSUE_TEMPLATE/sweep-task.yml` (Sweep), `qodo-pr-agent.yml` (Qodo review) | Show a green Actions run, a Sweep issue turning into a PR, and the AI review comment on a PR |
| Test generation with Codium/Qodo | 5% | 137 unit tests plus integration tests against real pgvector; `docs/test-generation.md` | Show Qodo generating tests for one module and the commit that keeps them |
| Integration quality and documentation | 5% | README (architecture, setup, testing, CI/CD, security), this page, typed code, lint clean | Walk the architecture diagram, then run `npm run check` |

Two rows need an action from you before the evaluation, because they depend on third-party accounts: install the **Sweep GitHub App** on the repository and open one `Sweep:` issue, and run **Qodo** on one module (see `docs/test-generation.md`). Take screenshots as you go.

## What was added for A2

| Addition | Where | Why it matters |
|---|---|---|
| **Hybrid retrieval** (vector + PostgreSQL full-text search, merged with Reciprocal Rank Fusion) | `src/services/rag/fusion.ts`, `retriever.ts`; switch with `RETRIEVAL_MODE=hybrid` | Embeddings blur exact names such as `verifyGithubSignature`. Keyword search finds them, and fusion keeps the best of both. |
| **Evaluation lab** | `src/services/rag/eval-metrics.ts`, `scripts/eval-retrieval.ts`, `eval/codemind-questions.json`; run `npm run eval -- <projectId>` | Measures hit rate, MRR and precision for vector vs hybrid on a fixed question set, so claims about retrieval quality are backed by numbers. |
| **GitHub webhook automation** | `src/app/api/webhooks/github/route.ts`, `src/lib/github-webhook.ts` | A push to the default branch triggers commit analysis automatically. Requests are verified with an HMAC-SHA256 signature in constant time. |
| **Sweep.dev setup** | `sweep.yaml`, issue template | AI agent drafts PRs from issues, with repository rules (tests required, no secrets). |
| **Qodo PR-Agent** | `.github/workflows/qodo-pr-agent.yml`, `.pr_agent.toml` | Automated PR description, review and test suggestions. |
| **25 more unit tests, 4 more integration tests** | `tests/unit/fusion`, `eval-metrics`, `github-webhook`; `tests/integration/hybrid` | Covers the new code, including a check that hybrid search never leaks another project's chunks. |

## Demo script (about 5 minutes)

1. **Problem and approach** (30 s): local-first AI codebase assistant, no code leaves the machine.
2. **Q&A with RAG** (90 s): ask a question, point at the sources, line ranges and scores, then compare RAG against no-RAG.
3. **Hybrid search** (60 s): `npm run eval -- <projectId>` and read the vector vs hybrid table.
4. **Automation** (90 s): Actions run, Sweep PR, Qodo or AI review comment, and the webhook updating the dashboard after a push.
5. **Tests and quality** (30 s): `npm test` (137 passing), integration tests on pgvector.

## Future scope to explain

Each item builds on something already in the code.

1. **Tree-sitter chunking.** Chunks are function-level now, using a splitter. Parsing the syntax tree would give exact function and class boundaries in every language.
2. **Code graph.** Index imports and calls to answer "who calls this?" and "what breaks if I change it?". This is the "source graph" idea from A1, taken further.
3. **Reranking.** Add a cross-encoder to reorder the fused results. Fusion already produces a good candidate list.
4. **Incremental indexing.** The webhook already knows which push happened. Next step: re-embed only the files that changed.
5. **Qdrant as the main vector store.** It is provisioned. pgvector is simpler today, and Qdrant scales better.
6. **Streaming answers and background jobs.** Indexing and long answers run in the request. A queue with progress would remove that.
7. **Multi-user and private repositories.** The app runs as one local user. GitHub OAuth would add accounts and private repos.
8. **PR bot as a product feature.** Post the breaking-change analysis as inline PR comments, not only a summary.
9. **IDE extension.** Ask questions about the repository from inside VS Code.
10. **Larger local models and a bigger evaluation.** Re-run the evaluation lab on a 7B–14B model and more repositories.

## Known limits (say these before you are asked)

- The local 3B model is fast but can miss details across many files. The model switcher and answer escalation exist for that reason.
- Hybrid search is off by default until the evaluation shows it wins on your repository. Run `npm run eval` and decide from the numbers.
- Breaking-change detection is advisory and can miss or over-flag changes.
