import type { Writer } from "../../src/services/report/writer";

export function part9(w: Writer) {
  w.h1("9. What is new, and what was there before");
  w.p("Three layers of work, oldest first. Adjust the 'before' list to match exactly what you presented in the first evaluation.");

  w.h2("Layer 0: the starting point (not our work)");
  w.p("git-inspect by Parth Pankaj Singh (MIT licence): the Next.js and tRPC base, GitHub loading, commit analysis and the dashboard, powered by Google Gemini. Always credit it.");

  w.h2("Layer 1: built before this week");
  w.table(
    [{ header: "What", weight: 3 }, { header: "In plain words", weight: 6 }],
    [
      ["Local AI with Ollama", "Replaced Gemini as the default. Models sit behind LLMProvider and EmbeddingProvider interfaces, so any model can be swapped in."],
      ["Model evaluation", "Compared qwen3:4b, qwen3:1.7b and qwen2.5-coder:3b on a 4 GB graphics card. Chose qwen2.5-coder:3b-instruct: fast, direct, fits in memory. The Qwen3 models wasted their words on hidden reasoning."],
      ["LangChain RAG pipeline", "Retrieval separated from generation, a context budget for the small window, honest 'not enough information' answers, relevance scores, and a no-retrieval baseline."],
      ["Cloud models (optional)", "Gemini and Groq with a model switcher, live model lists, and clear local or cloud labels."],
      ["RAG on / off / compare", "Answer with retrieval, without, or both side by side, to show what retrieval adds."],
      ["Auto-scale with approval", "Small model first, bigger one only when you press a button."],
      ["Function-level index", "Chunks with line numbers, so answers cite exact functions."],
      ["Connect screen", "File preview before indexing and live server-side progress with timings."],
      ["Repository insights", "Languages, Docker, CI, tests and suggestions detected from file names."],
      ["Breaking-change monitor", "Commit analysis with severity, charts and alerts."],
      ["AI Metrics and System Status", "Every model call measured; live health of every service; Prometheus and Grafana."],
      ["Single local user", "Removed the third-party sign-in. Every search stays scoped to one repository."],
      ["Tests, Docker, CI/CD", "Unit and integration tests, multi-stage Docker image, Compose, GitHub Actions CI, CD to GHCR and an AI pull-request review."],
      ["Bug fixes found by tests", "Diff summaries counted headers as changes; GitHub links ending with a slash or .git failed to parse; invalid JSON from the model; sign-in redirect."],
    ],
  );

  w.h2("Layer 2: the engine work for the second evaluation");
  w.table(
    [{ header: "What", weight: 3 }, { header: "In plain words", weight: 6 }],
    [
      ["Hybrid search", "Vector search plus keyword search, merged with RRF. Switch: RETRIEVAL_MODE=hybrid."],
      ["Evaluation lab", "Scores search quality with hit rate, MRR and precision. Command: npm run eval."],
      ["GitHub webhook", "A signed push message makes CodeMind analyse new commits automatically."],
      ["Sweep.dev and Qodo set-up", "sweep.yaml, an issue template, a Qodo pull-request workflow, and a test-generation guide."],
      ["Token streaming in every provider", "Ollama, Gemini and Groq can all stream, through one common method."],
      ["Follow-up memory", "History helpers: trim, detect follow-ups, widen the search, add earlier turns to the prompt."],
      ["Symbol scanner", "Finds every function, class and method in a file with its line number."],
      ["Offline indexer", "npm run index:local indexes a folder with no GitHub and no AI summaries."],
      ["Prompt version 5", "Answers 'does it have X?' correctly and refuses off-topic trivia. 'Grounded' is no longer shown when the model declined."],
      ["Tests", "From 112 to 227 unit tests, and from 4 to 8 integration tests."],
    ],
  );

  w.h2("Layer 3: the screens and features for the second evaluation");
  w.table(
    [{ header: "What", weight: 3 }, { header: "Where to find it", weight: 6 }],
    [
      ["Streaming answers + Stop", "Dashboard, Ask box: open the conversation window."],
      ["Chat history and follow-ups", "Same window: the box at the bottom, 'Conversation (N)' and 'New chat' buttons."],
      ["Compare models", "Sidebar: Compare Models."],
      ["Retrieval lab", "Sidebar: Retrieval Lab."],
      ["Explain this file", "Sidebar: Repository Files, pick a file, press the button."],
      ["Export report (PDF)", "Dashboard, top right: Export report."],
      ["Fluid design", "All new screens: smooth sizes, fixed chart shape, auto-fit columns."],
      ["Built-in explanations", "'How this works' boxes and question-mark tooltips on every new page."],
    ],
  );
}

export function part10(w: Writer) {
  w.h1("10. Numbers, limits and future scope");

  w.h2("Numbers worth remembering (all measured)");
  w.table(
    [{ header: "Fact", weight: 6 }, { header: "Value", weight: 3 }],
    [
      ["Local answer model", "qwen2.5-coder:3b-instruct, 1.9 GB"],
      ["Embedding model and vector length", "nomic-embed-text, 274 MB, 768 numbers"],
      ["Chunk size and overlap", "1,500 and 150 characters"],
      ["Local context window", "3,072 tokens, about 2,000 words"],
      ["Indexing this repository offline", "220 files, 792 chunks, about 22 seconds"],
      ["Retrieval time per question", "about 20 ms (vector), about 50 ms (hybrid)"],
      ["Writing speed: local / Gemini / Groq", "about 48 / 170 / 920 tokens per second"],
      ["Time to first word: local / Gemini / Groq", "1.5 s / 1.1 s / 0.7 s (one test)"],
      ["Search quality, 10 questions, top 6", "Vector: hit rate 80%, MRR 0.65. Hybrid: hit rate 90%, MRR 0.72"],
      ["Tests", "227 unit + 8 integration, all passing"],
    ],
  );
  w.callout("How to say the search result honestly", "'On our ten test questions, hybrid search found the right file 90 percent of the time instead of 80 percent, and ranked it higher. Ten questions is a small test, so we call it evidence, not proof, and the lab lets anyone test more.'", "tip");

  w.h2("Honest limits (say these before you are asked)");
  w.bullets([
    "The 3-billion-parameter local model is fast and private, but can miss details across many files and may answer some off-topic questions. That is why Auto-scale and Compare models exist.",
    "Hybrid search is off by default until measured on your own repository. The evaluation is small (10 questions) and written by us.",
    "Function boundaries come from a text splitter and pattern matching, not a full syntax tree.",
    "Breaking-change detection is advisory. It can miss or over-flag changes.",
    "The Explain panel reads only the start of very long files.",
    "Sweep.dev and Qodo are configured but not yet run.",
    "Indexing runs while you wait and takes minutes on a laptop for a big repository.",
  ]);

  w.h2("Future scope (each builds on something that already exists)");
  w.table(
    [{ header: "Idea", weight: 3 }, { header: "Why, and what it builds on", weight: 6 }],
    [
      ["Tree-sitter chunking", "Parse the real syntax tree for exact function and class boundaries in every language. Builds on the symbol scanner."],
      ["Code graph", "Index who calls whom, so 'what breaks if I change this?' can be answered. Grows from the symbol scanner and semantic navigation."],
      ["Reranking", "A second model re-orders the merged results for even better precision. Builds on hybrid search."],
      ["Incremental indexing", "Re-embed only changed files after a push. The webhook already knows what changed."],
      ["Qdrant as the main store", "Faster at very large scale. Already installed."],
      ["Background jobs and queues", "Index without making the user wait."],
      ["Accounts and private repositories", "GitHub sign-in and several users. Today it is one local user."],
      ["Pull-request bot with inline comments", "Post the breaking-change analysis on the exact lines. Builds on the AI review workflow."],
      ["VS Code extension", "Ask questions without leaving the editor."],
      ["Bigger local models and a bigger evaluation", "Re-run the Retrieval lab on a 7B to 14B model and on more repositories."],
    ],
  );
}

export function part11(w: Writer) {
  w.h1("11. Presenting it tomorrow");

  w.h2("Before you start (checklist)");
  w.numbered([
    "Open Docker Desktop. Wait until it says running.",
    "In the project folder run: docker compose up -d db qdrant",
    "Make sure Ollama is running (the llama icon in the menu bar). Both models are already downloaded.",
    "Run: npm run dev and open http://localhost:3000. Pick your repository in the sidebar.",
    "Do one test question first so the model is warm. The first answer after a restart is slower.",
    "Rotate the GitHub token that appeared in chat, and keep your API keys private.",
    "Take screenshots of every screen as a backup in case something fails live.",
  ]);

  w.h2("A five-minute demo");
  w.table(
    [{ header: "Minutes", weight: 1.2 }, { header: "What you do", weight: 4 }, { header: "What you say", weight: 6 }],
    [
      ["0:00", "Show the dashboard.", "The problem: reading code is slow. CodeMind has read this repository and everything runs on my laptop."],
      ["0:45", "Ask a question. Let the answer stream. Point at the sources.", "Sources come first, so you can check the proof. This is RAG: look up, then answer."],
      ["1:45", "Ask a follow-up: 'and where is it used?'", "It remembers the last three questions. Show the 'Follow-up' badge."],
      ["2:15", "Try 'Compare both' once (with and without RAG).", "Without the code the model only guesses. That is what retrieval adds."],
      ["2:45", "Open Compare Models. Run three models.", "Local is private and free. Cloud is faster. Here are the numbers, measured."],
      ["3:45", "Open Retrieval Lab. Run the sample.", "We measure search quality. Hybrid improved hit rate from 80 to 90 percent on ten questions."],
      ["4:20", "Explain this file, then Export report.", "Plain-English explanation, and a PDF anyone can read."],
      ["4:50", "Close with the future scope slide.", "Tree-sitter, a code graph, reranking and a VS Code extension."],
    ],
  );

  w.h2("Questions a teacher may ask, with answers");
  const qa: [string, string][] = [
    ["What problem does it solve?", "It cuts the time to understand an unfamiliar codebase, by answering questions about it with proof from the code."],
    ["Why run the AI locally?", "Privacy: the code never leaves the machine. Also no cost and no API key. The price is a smaller, less clever model."],
    ["Why RAG and not training the model on the code?", "Training (fine-tuning) is slow, costly and out of date after the next commit. RAG always uses the current code and can show its sources."],
    ["What is an embedding?", "A list of 768 numbers that captures the meaning of a piece of text. Similar meaning gives similar numbers, so we can search by meaning."],
    ["Why pgvector and not a separate vector database?", "One database for everything, simple to run, and every search can be limited to one project. Qdrant is ready if we outgrow it."],
    ["Why split code into function-sized chunks?", "The model's window is small and a whole file is about many things. Chunks are precise and let us cite line numbers."],
    ["What is hybrid search and why?", "Meaning search plus exact-word search, merged with Reciprocal Rank Fusion. Exact names like verifyGithubSignature are caught by keywords."],
    ["How do you know it works?", "The Retrieval lab scores it: hit rate, MRR and precision. On ten questions hybrid improved hit rate from 80 to 90 percent. It is a small test, and we say so."],
    ["How do you stop it making things up?", "Rules in the prompt, a fixed 'not enough information' reply, sources shown for every answer, and a 'grounded' badge that is only green when real code was used."],
    ["It still answered an off-topic question. Why?", "A 3-billion-parameter model follows rules less strictly than a big one. Prompt version 5 improved it; Auto-scale and larger models improve it further."],
    ["How does streaming work?", "The server sends one JSON message per line as the model writes. The browser reads the lines and draws the text. Stop cancels the request and the model."],
    ["How does it remember the conversation?", "The last three questions are added to the search and to the prompt. The chat is saved in the browser."],
    ["What did you build, and what did you reuse?", "The base is git-inspect (MIT licence, credited). We added local AI, RAG, function-level search, hybrid search, evaluation, streaming, chat, compare, explain, report, automation and tests."],
    ["How is it tested?", "227 fast unit tests with a fake AI, 8 integration tests on a real database, and manual tests in a real browser at three screen sizes."],
    ["What is CI/CD?", "Automation on GitHub: every push is linted, tested and built, and a Docker image is published. Continuous Integration checks, Continuous Delivery ships."],
    ["What are Sweep and Qodo here?", "Sweep turns an issue into a draft pull request. Qodo reviews pull requests and suggests tests. Both are configured; say whether you have run them."],
    ["What is a webhook, and is it safe?", "GitHub calls our server on every push. We verify an HMAC-SHA256 signature using a shared secret, so fake requests are rejected."],
    ["What are the limits?", "Small local model, small evaluation, advisory breaking-change checks, long files only partly read."],
    ["What would you do next?", "Tree-sitter chunking, a code graph, reranking, incremental indexing, accounts, and a VS Code extension."],
  ];
  qa.forEach(([q, a]) => {
    w.need(54);
    w.text(`Q. ${q}`, { font: w.bold, size: 10 });
    w.text(a, { size: 10, x: 58 - 10 });
    w.gap(5);
  });
}

export function part12(w: Writer) {
  w.h1("12. Glossary: every word in simple language");
  w.p("Alphabetical. The last column tells you where CodeMind uses it.");
  const g: [string, string, string][] = [
    ["API", "A set of web addresses a program offers so other programs can talk to it.", "/api/ask, /api/report"],
    ["Aspect ratio", "The shape of a box, width divided by height. 16 by 9 is a wide screen.", "Charts"],
    ["Auto-scale", "Answer with the small model first, offer a bigger one if the answer looks weak.", "Ask AI"],
    ["Breaking change", "A code change that can make other code stop working.", "Commit analysis"],
    ["Chunk", "A small piece of a file, usually one function.", "Search index"],
    ["CI/CD", "Continuous Integration and Delivery: automatic checks and releases on every change.", "GitHub Actions"],
    ["clamp()", "A CSS function that keeps a size between a minimum and a maximum while following the screen width.", "Fluid design"],
    ["Commit", "One saved change to the code, with a message and an author.", "Dashboard"],
    ["Context window", "How much text a model can read at once, counted in tokens.", "Prompt budget"],
    ["Cosine similarity", "A score from 0 to 1 for how alike two vectors are, by the angle between them.", "Vector search"],
    ["Diff", "The lines added and removed in a commit.", "Breaking changes"],
    ["Docker", "A way to pack an app and what it needs into one portable container.", "Deployment"],
    ["Embedding", "A list of numbers that stands for the meaning of a text.", "Search"],
    ["Evaluation", "Measuring quality with numbers on questions with known answers.", "Retrieval lab"],
    ["Fine-tuning", "Retraining a model on new data. Slow and costly. We use RAG instead.", "Why RAG"],
    ["Fluid design", "Sizes that grow smoothly with the screen instead of jumping at breakpoints.", "All new screens"],
    ["GHCR", "GitHub Container Registry, a place that stores Docker images.", "CD workflow"],
    ["Grounded", "An answer that is based on code that was actually found.", "Answer badge"],
    ["Hallucination", "A confident answer that is not true.", "Why guardrails"],
    ["HMAC", "A signature made from a message and a shared secret, to prove who sent it.", "Webhook"],
    ["Hit rate", "Share of questions where the right file was found in the top results.", "Retrieval lab"],
    ["Hybrid search", "Meaning search plus exact-word search, merged.", "Retrieval"],
    ["Indexing", "Reading a repository and storing it in a searchable form.", "Connect screen"],
    ["JSON", "A simple text format for data: names and values in curly brackets.", "Model output, streaming"],
    ["LangChain", "A library for building AI apps from standard parts: prompts, models, parsers.", "RAG chain"],
    ["LLM", "Large Language Model: a program that writes text by predicting the next word.", "qwen2.5-coder, Gemini"],
    ["localStorage", "A small storage area inside the browser.", "Chat history"],
    ["MRR", "Mean Reciprocal Rank: average of 1 divided by the rank of the right file.", "Retrieval lab"],
    ["NDJSON", "One JSON message per line. Easy to send as a stream.", "Streaming"],
    ["Ollama", "A program that runs open AI models on your own computer.", "Local AI"],
    ["Parameter", "One learned number inside a model. 3B means 3 billion.", "Model size"],
    ["pgvector", "A PostgreSQL add-on for storing and searching vectors.", "Memory layer"],
    ["PostgreSQL", "A popular open-source database.", "All data"],
    ["Precision", "Of the files returned, the share that were right.", "Retrieval lab"],
    ["Prisma", "A tool that describes tables in code and gives safe database access.", "Database"],
    ["Prompt", "The full text sent to a model: rules, code and question.", "Answering"],
    ["Pull request", "A proposal to merge changes into the main code, reviewed first.", "CI, Sweep, Qodo"],
    ["Qdrant", "A database built only for vectors.", "Future store"],
    ["RAG", "Retrieval-Augmented Generation: search first, then answer from what was found.", "Core idea"],
    ["Reranking", "Re-ordering search results with a second, smarter model.", "Future scope"],
    ["Repository", "A project folder tracked by Git, usually on GitHub.", "Everything"],
    ["RRF", "Reciprocal Rank Fusion: merge ranked lists by adding 1 divided by (60 + rank).", "Hybrid search"],
    ["Server-Sent Events", "A way for a server to push a stream of text lines to a browser or program.", "Cloud streaming"],
    ["Streaming", "Sending a result piece by piece as it is made.", "Answers"],
    ["Temperature", "How adventurous a model is. Low is steady.", "0.2 here"],
    ["Token", "A piece of a word, about four characters.", "Limits and speed"],
    ["tRPC", "Calls server functions from the browser with shared types.", "Frontend to server"],
    ["Vector", "A list of numbers. Here, 768 of them.", "Embeddings"],
    ["Vector database", "A database that can find the nearest vectors quickly.", "pgvector, Qdrant"],
    ["Webhook", "A call from one service to another when something happens.", "GitHub push"],
    ["Zod", "A library that checks that data has the right shape.", "Input validation"],
  ];
  w.table(
    [{ header: "Term", weight: 2.2 }, { header: "Plain meaning", weight: 6 }, { header: "Used in", weight: 2.2 }],
    g.map(([a, b, c]) => [a, b, c]),
  );
}
