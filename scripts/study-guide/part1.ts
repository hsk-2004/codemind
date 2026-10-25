import { rgb } from "pdf-lib";
import { ACCENT, H, M, W, type Writer } from "../../src/services/report/writer";

export function cover(w: Writer) {
  w.page.drawRectangle({ x: 0, y: H - 300, width: W, height: 300, color: ACCENT });
  w.page.drawText("CodeMind", { x: M, y: H - 130, size: 44, font: w.bold, color: rgb(1, 1, 1) });
  w.page.drawText("Study guide", { x: M, y: H - 168, size: 22, font: w.regular, color: rgb(0.85, 0.9, 1) });
  w.page.drawText("Everything we built, in plain words:", { x: M, y: H - 220, size: 12, font: w.regular, color: rgb(0.85, 0.9, 1) });
  w.page.drawText("how it works, what every term means, and what is new.", { x: M, y: H - 237, size: 12, font: w.regular, color: rgb(0.85, 0.9, 1) });
  w.y = H - 330;
  w.h3("How to use this guide");
  w.bullets([
    "Read parts 1 to 3 first. They tell the story: the problem, what a user does, and how the pieces fit together.",
    "Parts 4 and 5 are the technical heart: embeddings, search, the prompt, and every feature, step by step.",
    "Part 9 lists exactly what is new. Part 11 has the questions a teacher is likely to ask, with answers.",
    "Part 12 is a glossary. Every difficult word in this guide is explained there in simple language.",
    "You do not need to memorise code. Memorise the flows (the numbered boxes) and the numbers in part 10.",
  ]);
  w.callout(
    "A note on honesty",
    "Say only what is true. Some things are built and tested (streaming, compare, retrieval lab, explain, PDF report). Some are only set up and still need an account or a key (Sweep.dev and Qodo). Part 10 lists these clearly, so you are never caught out.",
    "warn",
  );
  w.p("Project: CodeMind, an AI codebase engineer. Built on the open-source project git-inspect by Parth Pankaj Singh (MIT licence). Always give that credit.", { size: 9, color: rgb(0.38, 0.44, 0.5) });
}

export function part1(w: Writer) {
  w.h1("1. The idea in one minute");

  w.h2("The problem");
  w.p(
    "When a developer joins a project, or opens an old one, the first days go into reading code. Where is the login? What does this file do? What changed last week? In a big project nobody remembers everything.",
  );
  w.p(
    "A normal chatbot does not fix this. It has never seen your code, so it guesses. Pasting your code into a website also means sending private code to a company.",
  );

  w.h2("What CodeMind does");
  w.bullets([
    "You connect a GitHub repository. CodeMind reads it and builds a searchable index.",
    "You ask questions in plain English. CodeMind finds the relevant code, answers using only that code, and shows you the files it used as proof.",
    "It watches new commits and warns you about changes that might break things.",
    "All the AI runs on your own computer by default, so your code never has to leave it.",
  ]);
  w.callout("The one-sentence pitch", "CodeMind is an AI assistant that has read your repository, answers questions about it with proof, and does not have to send your code to the cloud.", "key");

  w.h2("Why local-first matters");
  w.bullets([
    "Privacy: the code stays on your machine. This is the main selling point.",
    "Cost: no monthly bill and no API key needed.",
    "Works offline once the models are downloaded.",
    "The trade-off: a small local model is less clever than a big cloud model. We handle that with an optional, approved 'scale up' to a cloud model (part 5).",
  ]);

  w.h2("Three ideas to remember");
  w.numbered([
    "RAG (Retrieval-Augmented Generation): look the answer up first, then write it. The model reads the right code before it answers, so it does not have to guess.",
    "Embeddings: a way to turn the meaning of text into numbers, so a computer can search by meaning and not only by exact words.",
    "Small private model by default, bigger cloud model only if you approve. You choose the balance between privacy and power.",
  ]);
}

export function part2(w: Writer) {
  w.h1("2. What a user does: the journey");
  w.p("Follow one person from the first click to a finished report. Each box is one step.");
  w.flow([
    { title: "Connect a repository", text: "Paste a GitHub link (and a token if the repository is private). CodeMind first shows which files it will index, then shows live progress: the stage, how many files are done, the file it is on, and timings." },
    { title: "CodeMind reads the repository (indexing)", text: "It downloads the code, picks the important files, writes a short AI summary of them, splits every file into function-sized pieces, and turns each piece into numbers called an embedding. Everything is saved in the database. Part 4 explains this slowly." },
    { title: "Look at the dashboard", text: "The dashboard shows how many files were indexed, which languages the code uses, whether Docker, CI and tests exist, the recent commits, and any commit flagged as a breaking change." },
    { title: "Ask a question", text: "Type something like 'How does login work?'. The sources appear first (file names, line numbers and a match score). Then the answer writes itself word by word, like ChatGPT. You can press Stop at any time." },
    { title: "Ask a follow-up", text: "Type 'and where is it used?'. CodeMind remembers your last 3 questions, so 'it' makes sense. The conversation is saved in your browser, so it is still there after a refresh." },
    { title: "Dig deeper", text: "Explain this file: a list of the functions plus a plain-English explanation. Compare models: ask one question to the local model, Gemini and Groq side by side. Retrieval lab: measure how good the search is. Semantic search: find code by meaning." },
    { title: "Share and automate", text: "Export a PDF report. When someone pushes code to GitHub, a webhook tells CodeMind and it analyses the new commits by itself. CI/CD checks every change before it is accepted." },
  ]);

  w.h2("The screens, one by one");
  w.table(
    [{ header: "Screen", weight: 2.2 }, { header: "What it is for", weight: 6 }, { header: "Status", weight: 1.5 }],
    [
      ["Connect repository", "Add a GitHub repository. Preview the files first, then watch live indexing progress.", "Before"],
      ["Dashboard", "Overview numbers, the Ask box, languages and DevOps detection, commits, breaking-change monitor, Export report button.", "Updated"],
      ["Ask AI", "Ask questions, follow-ups, and keep a list of saved answers.", "Updated"],
      ["Compare Models", "The same question answered by two to four models side by side, with speed and size.", "NEW"],
      ["Semantic Search", "Search the code by meaning instead of exact words.", "Before"],
      ["Retrieval Lab", "Test how well the search finds the right files, with scores and charts.", "NEW"],
      ["Repository Files", "Browse indexed files. Explain this file opens a side panel.", "Updated"],
      ["AI Metrics", "Speed, tokens and errors for every model call, local or cloud.", "Before"],
      ["System Status", "Is Ollama running? Are the models, the database and Qdrant healthy?", "Before"],
    ],
  );
}

export function part3(w: Writer) {
  w.h1("3. The big picture");
  w.p("CodeMind has five layers. A request goes down through them and the answer comes back up.");
  w.layers([
    { name: "1. Browser", text: "What you see. Next.js and React pages, Tailwind styling. It shows the answer as it streams in, and keeps your chat in the browser." },
    { name: "2. Server", text: "Next.js API routes and tRPC. They check the input, check you may see the project, run the search, call the model and stream the result back." },
    { name: "3. AI brain", text: "Ollama runs two local models on your computer: qwen2.5-coder (writes answers) and nomic-embed-text (makes embeddings). Gemini and Groq are optional cloud models." },
    { name: "4. Memory", text: "PostgreSQL with the pgvector add-on stores projects, files, code chunks, their vectors, commits, saved answers and metrics. Qdrant is installed for the future." },
    { name: "5. Outside world", text: "GitHub: the source of the code and the commits, and the sender of webhooks when someone pushes." },
  ]);

  w.h2("Where things live in the code");
  w.table(
    [{ header: "Folder", weight: 3.2, mono: true }, { header: "What is inside", weight: 6 }],
    [
      ["src/app", "The pages and the API routes (ask, explain, report, webhook, tRPC)."],
      ["src/components", "Reusable screen pieces: answer panel, explainer box, info tooltip, buttons."],
      ["src/server", "Server logic: the ask pipeline, explain, report data, database access rules."],
      ["src/services/rag", "Search and answering: chunking, retrieval, hybrid search, prompts, evaluation."],
      ["src/services/llm", "One class per model provider (Ollama, Gemini, Groq) behind one common shape."],
      ["src/lib", "Helpers used by both the browser and the server."],
      ["prisma", "The database schema (the list of tables)."],
      ["tests", "227 unit tests and 8 integration tests."],
      ["scripts", "Command-line tools: npm run eval, npm run index:local."],
      [".github", "CI/CD workflows, the AI pull-request review, Qodo, issue template for Sweep."],
      ["monitoring", "Prometheus and Grafana settings for live graphs."],
    ],
  );
  w.callout("Why this design is good to mention", "Every model sits behind one common interface (LLMProvider). Adding a new provider means writing one small class. The rest of the app does not change.", "tip");
}
