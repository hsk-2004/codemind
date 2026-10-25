import type { Writer } from "../../src/services/report/writer";

export function part5(w: Writer) {
  w.h1("5. The features, one by one");
  w.p("For each feature: what the user sees, how it works inside, and why it matters.");

  w.h2("5.1 Ask AI with sources");
  w.bullets([
    "User sees: a question box, four modes (With RAG, Without RAG, Auto-scale, Compare both), and answers that list their sources with a match percentage.",
    "Inside: the pipeline of part 4. 'Without RAG' skips the search, so you can show how much worse an answer is without the code. 'Compare both' shows the two side by side.",
    "Why it matters: it proves RAG helps. Ask the same question both ways in the demo.",
  ]);

  w.h2("5.2 Auto-scale: a small model first, a big one only if you agree");
  w.flow([
    { title: "Answer with the small local model", text: "Fast, private, free. Nothing leaves the computer." },
    { title: "Check if the answer looks weak", text: "Two simple checks: the model said it could not find enough information, or the answer did not mention any of the files it was given." },
    { title: "Offer a button, never do it silently", text: "If weak, CodeMind shows 'Scale up to Gemini or Groq' and says plainly that the code excerpts will be sent to that provider." },
    { title: "Answer again with the bigger model", text: "Only after you press the button. The same retrieved code is reused, so only the thinking changes." },
  ]);

  w.h2("5.3 Streaming answers (new)");
  w.bullets([
    "User sees: sources first, then words appear one by one with a blinking cursor, a live timer, and a Stop button.",
    "Inside: each model provider got a stream method. Ollama sends one JSON object per line. Gemini and Groq use Server-Sent Events (lines starting with 'data:'). A shared reader joins lines even when the network cuts them in the middle.",
    "Why it matters: a local model can take 5 to 10 seconds. Watching the answer arrive feels instant, and people can stop a bad answer early.",
  ]);

  w.h2("5.4 Chat history and follow-ups (new)");
  w.bullets([
    "User sees: a chat window. After the first answer, a box for follow-ups, suggestion chips ('Explain in simpler terms'), and a New chat button.",
    "Problem: 'and where is it used?' means nothing alone. 'It' is in the previous message.",
    "Fix, two places. (1) Search: if a question is short (5 words or fewer) or contains words like 'it', 'this', 'that', we search with the previous question added. (2) Prompt: the last 3 questions and answers are written into the prompt, with answers shortened to 600 characters so they never crowd out the code.",
    "Saved in the browser (localStorage) per repository, up to 20 questions, with code excerpts shortened so it never fills storage.",
  ]);

  w.h2("5.5 Compare models (new)");
  w.bullets([
    "User sees: pick two to four models (default: local qwen, Gemini, Groq), type one question, press Compare. The answers stream side by side.",
    "Numbers per model: first word time, total time, speed in tokens per second, answer size in words, the model's size (gigabytes on disk for local; parameter count read from the name for cloud, for example 'gpt-oss-20b' means about 20 billion), and the tokens used.",
    "A trophy marks the best in each category. Charts and a table summarise at the bottom.",
    "Inside: cloud models run at the same time. Local models take turns, because one small graphics card runs one model at a time.",
    "Fairness note shown on screen: each model is given as much code as its window allows, so a bigger window may read more code. That is part of what is being compared.",
    "Privacy: a warning appears when a cloud model is selected, because code excerpts are sent to it.",
  ]);

  w.h2("5.6 Retrieval lab (new)");
  w.p("Question: how do we know the search is good? Answer: we measure it. You give the lab questions and the file that should be found for each (the answer key). It runs vector search and hybrid search and scores both.");
  w.table(
    [{ header: "Score", weight: 1.6 }, { header: "In plain words", weight: 6 }, { header: "Example", weight: 3 }],
    [
      ["Hit rate", "Out of all questions, how often did the right file show up in the top results?", "8 of 10 found = 80%"],
      ["MRR", "Mean Reciprocal Rank. Rewards the right file being near the top. Rank 1 = 1.0, rank 2 = 0.5, rank 4 = 0.25, not found = 0.", "ranks 1, 2, missed = (1 + 0.5 + 0) / 3 = 0.5"],
      ["Precision", "Of the files returned, how many were right? It is low when one right file is returned among six.", "1 right of 6 = 17%"],
    ],
  );
  w.bullets([
    "Question sources: the 10 CodeMind sample questions, questions you type, or 'Generate from this repository' (it writes questions from real function names and file descriptions).",
    "Command-line twin: npm run eval -- <projectId>. The page and the command run the same code, so their numbers always agree.",
  ]);

  w.h2("5.7 Explain this file (new)");
  w.bullets([
    "User sees: on Repository Files, an 'Explain this file' button opens a side panel. First a list of the functions and classes with their line numbers appears instantly. Then a plain-English explanation streams in: what the file is for, how it works, key functions, how it fits in.",
    "The function list is not AI. It is found by scanning the file for declarations, so it is exact. Only the explanation comes from the model: whichever model is chosen in the top-right box (local qwen by default).",
    "Long files: the model's window is small, so only the start of a very long file is read, and the panel says so ('Only the first N lines were read').",
    "Explanations are remembered while the page is open, so going back to a file is instant.",
  ]);

  w.h2("5.8 Export report (new)");
  w.bullets([
    "User sees: an Export report button, then a small dialog with tick boxes for sections, then a PDF download.",
    "Sections: overview, languages and tooling, breaking changes, saved answers, AI usage (calls, tokens, speed, by model).",
    "Inside: the server collects the facts from the database (no internet needed) and draws the PDF itself with the pdf-lib library. Unusual characters such as emoji are replaced, because PDFs built-in fonts cannot draw them.",
  ]);

  w.h2("5.9 Breaking-change detection");
  w.flow([
    { title: "Fetch recent commits", text: "Up to 20 not-yet-analysed commits are loaded from GitHub." },
    { title: "Read each diff", text: "The diff is the list of lines added and removed." },
    { title: "Ask the model for structured JSON", text: "Is it breaking? Severity (low, medium, high, critical)? What parts are affected? Is migration needed and how? The model is forced to answer in valid JSON (Ollama's JSON mode)." },
    { title: "Store and show", text: "Saved on the commit. The dashboard shows an alert, a monitor and charts. It is advisory: it can miss or over-flag changes." },
  ]);

  w.h2("5.10 GitHub webhook: automatic analysis (new)");
  w.p("A webhook is GitHub calling your server when something happens, so you do not have to keep asking. We add one address in the repository settings. When someone pushes to the default branch, GitHub sends a message and CodeMind analyses the new commits by itself.");
  w.bullets([
    "Security: GitHub signs every message with a secret (HMAC-SHA256 of the message body). We recompute the signature and compare in constant time. A wrong or missing signature is rejected with HTTP 401. We tested this live.",
    "Other answers: a ping returns 200. A push to another branch is ignored (202). A push for a repository we do not have is accepted but does nothing.",
    "CodeMind replies at once and does the slow work in the background, because GitHub only waits a few seconds.",
  ]);

  w.h2("5.11 Metrics: every model call is measured");
  w.p("Each call to any model is saved with its operation (answer, summary, explanation...), model, tokens, time to answer and speed. The AI Metrics page graphs it. Prometheus and Grafana can show live dashboards. This is how we can say with numbers that Groq writes about 900 tokens per second and our local model about 50.");
}

export function part6(w: Writer) {
  w.h1("6. The database: what is stored");
  w.p("PostgreSQL holds nine kinds of record. Prisma is the tool that describes them and talks to the database.");
  w.table(
    [{ header: "Table", weight: 2.4, mono: true }, { header: "What it holds", weight: 6 }],
    [
      ["Project", "One connected repository: name, GitHub link, created date, archived flag."],
      ["UserToProject", "Which user belongs to which project. Every read checks this first."],
      ["SourceCodeEmbedding", "One row per indexed file: path, full source code, AI summary, and the summary's vector."],
      ["CodeChunk", "One row per function-sized chunk: file, function name, start and end line, text and its vector."],
      ["Commit", "One analysed commit: message, author, date, AI summary, breaking-change flag, severity, details, migration steps."],
      ["Question", "A saved answer: the question, the answer and the files used."],
      ["LlmCall", "One row per model call: which model, tokens, time, speed, success or error. Powers the Metrics page."],
      ["IndexingJob", "Live progress and final report of one indexing run."],
      ["AppSetting", "Small settings, for example which model is selected."],
    ],
  );
  w.callout("Security idea worth saying out loud", "There is no sign-in: the app runs as one built-in local user. But every search and every read still checks the project id, so data of one repository can never leak into another. An integration test on a real database proves it.", "tip");
}

export function part7(w: Writer) {
  w.h1("7. The frontend, explained");
  w.h2("7.1 The tools");
  w.table(
    [{ header: "Tool", weight: 2.4 }, { header: "What it is, in plain words", weight: 6 }],
    [
      ["React", "A library for building screens out of small reusable pieces called components."],
      ["Next.js", "A framework on top of React. Gives pages, routing and server code in one project."],
      ["TypeScript", "JavaScript with types, so many mistakes are caught before the program runs."],
      ["tRPC", "Lets the browser call server functions as if they were local, with the types shared. No hand-written API layer."],
      ["Tailwind CSS", "Styling by small utility classes written next to the element."],
      ["Radix UI and shadcn/ui", "Accessible building blocks: dialogs, menus, tabs, tooltips."],
      ["Recharts", "Draws the bar charts."],
      ["Markdown renderer", "Turns the model's markdown (headings, lists, code) into formatted text."],
    ],
  );

  w.h2("7.2 Fluid design: sizes that flow");
  w.p("Most websites change layout at fixed screen widths (breakpoints), so text and spacing jump. We used fluid design: sizes that grow smoothly with the screen.");
  w.bullets([
    "Fluid text and spacing use the CSS function clamp(min, preferred, max). For example text-fluid-sm is clamp(0.8rem, 0.76rem + 0.2vw, 0.92rem): never smaller than 0.8rem, never bigger than 0.92rem, and in between it follows the window width. We named these tokens text-fluid-xs to xl and p, gap and spacing fluid-xs to lg.",
    "Same ratio: charts use aspect-chart (16 by 9) so every chart keeps the same shape on any screen. Model cards use equal-width columns.",
    "Auto-fit grids: grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr)). The browser fits as many equal columns as there is room for. No breakpoints needed, and the columns also reflow when you open or close the sidebar.",
    "A subtle bug we found and fixed: the class-merging helper (tailwind-merge) did not know our new names and quietly deleted real colour classes. We taught it the new tokens and added a test.",
    "Tested at 390 px (phone), 820 px (tablet) and 1440 px (desktop): no sideways scrolling and no console errors.",
  ]);

  w.h2("7.3 Explaining things inside the screens");
  w.bullets([
    "Each new page has a 'How this works' box with three numbered steps. It opens the first time and remembers if you close it.",
    "Small question-mark tooltips explain words like MRR and hit rate where they appear.",
    "Honest messages: warnings when code will go to the cloud, notices when the index is file-level only, and empty states that say what to do next.",
  ]);

  w.h2("7.4 How the browser handles a streamed answer");
  w.flow([
    { title: "Send the question", text: "A POST request to /api/ask with the question, project, mode and recent history." },
    { title: "Read the stream", text: "The response body is read line by line. Each line is one JSON event." },
    { title: "Update the screen", text: "Events are folded into the answer on screen: sources, then text, then final details. Tokens are batched per screen refresh." },
    { title: "Save the chat", text: "When nothing is being written, the conversation is saved in the browser (never half-written answers)." },
  ]);
}

export function part8(w: Writer) {
  w.h1("8. Quality, DevOps and security");

  w.h2("8.1 Testing");
  w.bullets([
    "227 unit tests (28 files) run in under a second. The AI is replaced by a fake, so tests are fast and never depend on a model being installed.",
    "8 integration tests run against a real PostgreSQL with pgvector. They prove, for example, that one project can never see another project's code.",
    "Things tested this time: streaming from all three providers with a fake network, line reading when the network splits a message, follow-up memory, RRF, evaluation scores, webhook signatures, the PDF builder with awkward text, and the class-merging fix.",
    "Beyond tests: we drove the real app in a real browser, asked real questions to the real local model, and checked the screens at three widths.",
  ]);

  w.h2("8.2 DevOps: automation around the code");
  w.table(
    [{ header: "Piece", weight: 2.4 }, { header: "What it does", weight: 6 }],
    [
      ["Docker", "Packs the app and everything it needs into a container that runs the same everywhere. Our image is multi-stage (small) and runs as a normal user, not root."],
      ["Docker Compose", "Starts the app, PostgreSQL and Qdrant with one command."],
      ["GitHub Actions: ci.yml", "On every push: lint, type-check, unit tests, create the database tables, integration tests on a real pgvector database, production build, Docker build."],
      ["GitHub Actions: cd.yml", "After CI passes on main, publishes the Docker image to GitHub Container Registry (GHCR)."],
      ["GitHub Actions: ai-review.yml", "On every pull request, runs a tiny local model (qwen2.5-coder:0.5b) inside the runner and posts a summary and a breaking-change verdict as a comment."],
      ["Sweep.dev (configured)", "An AI agent that turns a GitHub issue starting with 'Sweep:' into a draft pull request. We added sweep.yaml and an issue template. It starts working once its GitHub app is installed."],
      ["Qodo PR-Agent (configured)", "Reviews pull requests and suggests tests. Added as a workflow. It runs when a GEMINI_API_KEY secret is set, and skips itself otherwise."],
      ["Prometheus and Grafana", "Collect and draw live numbers such as latency and token use."],
    ],
  );
  w.callout("Be precise about Sweep and Qodo", "They are set up in the repository, but we have not run them: that needs an account or a key. Say 'configured and ready', not 'working'. Screenshot one real run before you claim more.", "warn");

  w.h2("8.3 Security and privacy");
  w.bullets([
    "Local-first: by default no code leaves the computer.",
    "Cloud only with consent: choosing a cloud model shows a warning, and Auto-scale asks before sending anything.",
    "Every search is filtered by project id.",
    "Input is checked with Zod schemas; GitHub links are parsed strictly; repository code is never executed.",
    "Webhooks are authenticated with an HMAC signature, compared in constant time.",
    "Secrets live in the .env file, which git ignores. Important: a GitHub token appeared in a chat during this work, so rotate it on GitHub before the presentation.",
    "The Docker image runs as a non-root user.",
  ]);
}
