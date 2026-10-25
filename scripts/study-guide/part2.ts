import type { Writer } from "../../src/services/report/writer";

export function part4(w: Writer) {
  w.h1("4. How the AI part works");
  w.p("This is the part teachers ask about most. Read it slowly. Every new word is explained the first time it appears, and again in the glossary.");

  w.h2("4.1 What is an LLM?");
  w.p(
    "An LLM (Large Language Model) is a program trained on huge amounts of text. It learned to continue text: given some words, it predicts the next word, then the next, until it has written an answer. Our local model is qwen2.5-coder with 3 billion parameters, which is small, fast and trained on a lot of code. A 'parameter' is one learned number inside the model. More parameters usually means smarter but slower and bigger.",
  );
  w.table(
    [{ header: "Word", weight: 2 }, { header: "Plain meaning", weight: 6 }],
    [
      ["Token", "A piece of a word. About 4 characters of English. 'chunking' is about 2 tokens. Models read and write tokens, not letters."],
      ["Context window", "How much text the model can look at in one go: your question, the code we give it, and its own answer together. Ours is 3,072 tokens for the local model, roughly 2,000 words. That is small, which is why we must choose the code carefully."],
      ["Temperature", "How adventurous the model is. 0 is always the safest word. We use 0.2, so answers stay steady and factual."],
      ["Prompt", "The full text we send to the model: the rules, the code, and your question."],
      ["Hallucination", "When a model confidently says something that is not true. The main danger of AI, and the reason for RAG."],
    ],
  );

  w.h2("4.2 Why a model alone is not enough: RAG");
  w.p(
    "The model has never seen your repository. If you ask 'where is login?', it can only guess. We could retrain it on your code (fine-tuning), but that is slow, expensive, and goes out of date with every commit.",
  );
  w.callout(
    "RAG = Retrieval-Augmented Generation",
    "Retrieval: first search the repository for the few pieces of code that matter. Augmented Generation: put those pieces into the prompt and ask the model to answer from them. It is an open-book exam: the model may look at the notes. The answer is always based on current code, and we can show which files were used.",
    "key",
  );
  w.pipeline(["Your question", "Search the repository", "Pick the best pieces of code", "Prompt = rules + code + question", "Model writes the answer", "Answer + sources"], 3);

  w.h2("4.3 Embeddings: turning meaning into numbers");
  w.p(
    "A computer cannot compare meanings, but it can compare numbers. An embedding model reads a piece of text and outputs a list of numbers that represents its meaning. Texts with similar meaning get similar numbers. Ours is nomic-embed-text, and it outputs 768 numbers for every piece of text. That list of 768 numbers is called a vector.",
  );
  w.callout(
    "Picture it as a map",
    "Imagine a huge map where every piece of text is a dot. 'login' and 'authentication' land close together. 'banana' lands far away. A question is also turned into a dot, and we simply look for the dots nearest to it. The real map has 768 directions instead of 2, but the idea is the same.",
    "tip",
  );
  w.h3("A tiny worked example (3 numbers instead of 768)");
  w.code([
    "login           = (0.90, 0.10, 0.00)",
    "authentication  = (0.85, 0.20, 0.05)",
    "banana          = (0.00, 0.10, 0.95)",
    "",
    "similarity(login, authentication) = 0.99   <- very similar",
    "similarity(login, banana)         = 0.01   <- unrelated",
  ]);
  w.p("The measure used is cosine similarity: the angle between two vectors. Same direction means similar meaning (score near 1). Unrelated means score near 0. In the database we compute it as 1 minus the cosine distance (the pgvector operator is <=>). We ignore matches below 0.3 because they are mostly noise.");
  w.callout("Why embeddings beat keyword search", "A keyword search for 'authentication' misses a file that only says 'login' and 'session'. An embedding search finds it, because the meaning is close. The weakness: embeddings blur exact names, which is why we added hybrid search in 4.7.", "info");

  w.h2("4.4 Where the vectors are stored");
  w.bullets([
    "PostgreSQL is a normal database. pgvector is an add-on that gives it a vector column type and fast 'nearest neighbour' search. We use it, so one database holds everything and every search can be limited to one project.",
    "Qdrant is a database made only for vectors. It is installed and running, but today pgvector does the work. Moving to Qdrant is future scope for very large repositories.",
    "Every search always includes the project id, so one repository can never read another repository's code. This is tested.",
  ]);

  w.h2("4.5 Chunking: cutting code into the right-sized pieces");
  w.p(
    "We cannot give the model a whole repository: the context window is tiny. We also should not embed a whole file as one dot, because a 500-line file is about many things. So we cut each file into chunks, then embed each chunk.",
  );
  w.bullets([
    "We cut at function and class boundaries when possible, so a chunk is usually one complete function. Chunk size is about 1,500 characters with 150 characters of overlap, so nothing important is cut in half.",
    "Every chunk remembers its file, its line numbers and the function name it starts with. That is how answers can say 'src/lib/github.ts, lines 41 to 60'.",
    "Before embedding, each chunk gets a label such as 'File: src/lib/ai.ts, function detectBreakingChanges, lines 10-40', so the vector knows where the code lives.",
    "Why function-level and not whole-file? Precision. A question about one function now finds that function, not a long file that merely mentions it.",
  ]);

  w.h2("4.6 Indexing: what happens when you connect a repository");
  w.flow([
    { title: "Download and filter", text: "Fetch the files from GitHub, skipping junk such as node_modules, lock files, images and build output." },
    { title: "Choose the important files", text: "A summary costs one model call per file, so only the most important files (up to 30 by default) get one. Chunks are cheap, so up to 300 files get chunks." },
    { title: "Summarise", text: "The local model writes a short plain-English summary of each important file." },
    { title: "Embed", text: "nomic-embed-text turns each summary, and each code chunk, into a 768-number vector." },
    { title: "Store", text: "Files, summaries, chunks and vectors go into PostgreSQL. The live progress screen is reading these steps while they happen." },
    { title: "Analyse commits", text: "The latest commits are fetched and checked for breaking changes (part 5)." },
  ]);
  w.p("To try CodeMind without GitHub, we added a command: npm run index:local. It indexes a folder on your computer with no internet and no AI summary (a rule-based one-line summary is used instead). It indexed this whole repository, 220 files and 792 chunks, in about 22 seconds.");

  w.h2("4.7 Hybrid search: meaning plus exact words");
  w.p("Vector search is good at meaning but can blur exact names like verifyGithubSignature. Keyword search is the opposite. Hybrid search runs both and merges the two ranked lists.");
  w.bullets([
    "Vector list: the chunks whose meaning is closest to the question.",
    "Keyword list: PostgreSQL full-text search for the important words in the question (filler words like 'how' and 'does' are removed).",
    "Merge with Reciprocal Rank Fusion (RRF). Each chunk scores 1 divided by (60 + its rank) in every list it appears in, and the scores are added. A chunk that both lists like rises to the top.",
  ]);
  w.h3("RRF worked example");
  w.code([
    "Vector list : x (rank 1), y (rank 2), z (rank 3)",
    "Keyword list: y (rank 1), w (rank 2), x (rank 3)",
    "",
    "score(y) = 1/62 + 1/61 = 0.03252   <- first",
    "score(x) = 1/61 + 1/63 = 0.03226   <- second",
    "score(w) = 1/62        = 0.01613",
    "score(z) = 1/63        = 0.01587",
  ]);
  w.p("Why 60? It is the standard value from the research paper. It stops one list from dominating. The big advantage: RRF uses only ranks, so we never have to compare a vector score with a keyword score, which are on different scales.");
  w.callout("Honest note", "Hybrid search is switched off by default (RETRIEVAL_MODE=vector). Switch it on with RETRIEVAL_MODE=hybrid. In our test it helped (part 10), but ten questions is a small test.", "warn");

  w.h2("4.8 Building the prompt and the guardrails");
  w.p("After search, we have the best chunks. The prompt has three parts:");
  w.numbered([
    "Rules (the system message): use only the code given; say 'No, X is not part of this project' when the code shows something is missing; name the files you used; never answer from general knowledge; if the question is not about this repository, reply with the fixed message 'I could not find enough relevant information'.",
    "The context: the chosen chunks, each labelled with its file name and a short summary, cut to fit a budget.",
    "The question (and, for a follow-up, the last few questions and answers).",
  ]);
  w.table(
    [{ header: "Model", weight: 2.4 }, { header: "Code given per file", weight: 2 }, { header: "Total code", weight: 2 }, { header: "Chunks searched", weight: 2 }],
    [
      ["Local (Ollama)", "1,800 characters", "7,500 characters", "6"],
      ["Groq", "6,000 characters", "14,000 characters", "8"],
      ["Gemini", "12,000 characters", "48,000 characters", "16"],
    ],
  );
  w.p("Bigger models have bigger windows, so they are given more code. This is called a context budget. The 'grounded' badge on an answer is green only when sources were found AND the model did not decline.");
  w.callout("The hard truth about small models", "A 3-billion-parameter model sometimes refuses a question it could answer, or answers an off-topic question from memory. We improved the prompt (version 5) so it now answers 'does it have X?' correctly and refuses trivia, but it is not perfect. That is the trade-off for privacy, and the reason Auto-scale exists.", "warn");

  w.h2("4.9 Generating and streaming the answer");
  w.p("The model writes one token at a time. Instead of waiting for the whole answer, the server sends each piece to the browser the moment it exists. This is called streaming.");
  w.pipeline(["Server sends: sources", "Server sends: token, token, token...", "Server sends: done + numbers", "Browser draws each piece live"], 4);
  w.bullets([
    "The data travels as NDJSON: one small JSON message per line, for example {\"type\":\"token\",\"text\":\"The\"}.",
    "Three message types: sources (shown first), token (a piece of the answer), done (final text plus timings and token counts). A fourth, error, reports problems.",
    "Stop button: the browser cancels the request. The server notices the connection closed and stops the model too, so no computing power is wasted.",
    "Smooth drawing: when a fast model sends hundreds of tokens per second, we merge the tokens that arrive between two screen refreshes into one update.",
  ]);
}
