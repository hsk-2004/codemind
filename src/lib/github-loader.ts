import { GithubRepoLoader } from '@langchain/community/document_loaders/web/github';
import { Document } from '@langchain/core/documents';
import { summariseCode, generateEmbedding } from './ai';
import { db } from '@/server/db';
import { LOADER_IGNORE_PATTERNS, isIndexableFile } from './file-selection';
import { parseGithubUrl } from './github-url';
import { formatDuration, noopReporter, type ProgressReporter } from './indexing-progress';

// File extensions to prioritize for summarization
const IMPORTANT_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.cpp', '.c', '.rs', '.go',
  '.php', '.rb', '.swift', '.kt', '.scala', '.cs', '.vue', '.svelte'
];


async function getDefaultBranch(repoUrl: string, token?: string): Promise<string> {
  const { owner, repo } = parseGithubUrl(repoUrl);
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: token?.trim() ? { Authorization: `Bearer ${token.trim()}` } : {},
  });
  if (!res.ok) throw new Error(`Failed to fetch repo info: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as { default_branch: string };
  return data.default_branch;
}

// Filter and prioritize documents
function filterAndPrioritizeDocs(docs: Document[], maxFiles: number = 50): Document[] {
  const filtered = docs.filter(doc => isIndexableFile(doc.metadata.source as string, doc.pageContent.length));

  // Prioritize files by importance
  const prioritized = filtered.sort((a, b) => {
    const aFile = a.metadata.source.toLowerCase();
    const bFile = b.metadata.source.toLowerCase();
    
    // Priority 1: Important code files
    const aIsImportant = IMPORTANT_EXTENSIONS.some(ext => aFile.endsWith(ext));
    const bIsImportant = IMPORTANT_EXTENSIONS.some(ext => bFile.endsWith(ext));
    if (aIsImportant && !bIsImportant) return -1;
    if (!aIsImportant && bIsImportant) return 1;
    
    // Priority 2: Root level files
    const aDepth = aFile.split('/').length;
    const bDepth = bFile.split('/').length;
    if (aDepth !== bDepth) return aDepth - bDepth;
    
    // Priority 3: README and main files
    if (aFile.includes('readme') || aFile.includes('index') || aFile.includes('main')) return -1;
    if (bFile.includes('readme') || bFile.includes('index') || bFile.includes('main')) return 1;
    
    return 0;
  });

  return prioritized.slice(0, maxFiles);
}

export const loadGithubRepo = async (githubUrl: string, githubToken?: string) => {
  const token = githubToken || process.env.GITHUB_TOKEN;
  const branch = await getDefaultBranch(githubUrl, token);
  
  const options: any = {
    branch,
    ignoreFiles: LOADER_IGNORE_PATTERNS,
    recursive: true,
    unknown: 'warn',
    maxConcurrency: 5,
  };
  
  if (token?.trim()) {
    options.accessToken = token.trim();
  }
  
  const loader = new GithubRepoLoader(githubUrl, options);
  return loader.load();
};

async function storeEmbedding(projectId: string, file: { summary: string; embedding: number[]; sourceCode: string; fileName: string }) {
  const row = await db.sourceCodeEmbedding.create({
    data: { summary: file.summary, sourceCode: file.sourceCode, fileName: file.fileName, projectId },
  });
  const vector = `[${file.embedding.join(',')}]`;
  await db.$executeRaw`UPDATE "SourceCodeEmbedding" SET "summaryEmbedding" = ${vector}::vector WHERE "id" = ${row.id}`;
}

/** Summarise, embed and store one file, reporting timings. Never throws. */
async function indexFile(doc: Document, projectId: string, reporter: ProgressReporter): Promise<boolean> {
  const fileName = doc.metadata.source as string;
  reporter.set({ currentItem: fileName });
  try {
    const t0 = Date.now();
    const summary = await summariseCode(doc, { projectId });
    const summaryMs = Date.now() - t0;
    const usedFallback = summary.includes('Analysis unavailable');

    const t1 = Date.now();
    const embedding = await generateEmbedding(summary, { projectId });
    const embedMs = Date.now() - t1;
    if (!embedding || embedding.length === 0) throw new Error('embedding model returned no vector');

    await storeEmbedding(projectId, { summary, embedding, sourceCode: doc.pageContent, fileName });
    reporter.increment('filesEmbedded');
    reporter.log(
      `${fileName} — summary ${formatDuration(summaryMs)}, embedding ${formatDuration(embedMs)} (${embedding.length}-d)` +
        (usedFallback ? ' · LLM unavailable, basic summary used' : ''),
      usedFallback ? 'warn' : 'success',
    );
    return true;
  } catch (error) {
    reporter.increment('filesFailed');
    reporter.log(`${fileName} — failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
    return false;
  } finally {
    reporter.increment('filesProcessed');
  }
}

export const indexGithubRepo = async (
  projectId: string,
  githubUrl: string,
  githubToken?: string,
  options: { maxFiles?: number; concurrency?: number; reporter?: ProgressReporter } = {}
) => {
  // One file at a time: the GPU runs a single generation at a time, so extra workers only queue inside Ollama.
  const { maxFiles = 30, concurrency = 1, reporter = noopReporter } = options;

  reporter.stage('loading', `Loading files from ${githubUrl}`);
  const docs = await loadGithubRepo(githubUrl, githubToken);
  reporter.set({ filesInRepo: docs.length });
  reporter.log(`Loaded ${docs.length} files from GitHub`);

  reporter.stage('selecting', 'Selecting files to index');
  const filteredDocs = filterAndPrioritizeDocs(docs, maxFiles);
  reporter.set({ filesSelected: filteredDocs.length });
  reporter.log(`Selected ${filteredDocs.length} of ${docs.length} files (source first, max ${maxFiles}; images, fonts, lockfiles, build output and files over 50 KB are skipped)`);

  reporter.stage('indexing', `Summarising and embedding ${filteredDocs.length} files`);
  const queue = [...filteredDocs];
  let successful = 0;
  // A small worker pool keeps the local model busy without overloading it.
  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      for (let doc = queue.shift(); doc; doc = queue.shift()) {
        if (await indexFile(doc, projectId, reporter)) successful++;
      }
    }),
  );
  reporter.set({ currentItem: null });
  reporter.log(`Indexed ${successful}/${filteredDocs.length} files`, successful === filteredDocs.length ? 'success' : 'warn');

  return {
    totalFiles: docs.length,
    processedFiles: filteredDocs.length,
    successfulEmbeddings: successful,
    failedEmbeddings: filteredDocs.length - successful,
  };
};

// Utility function to preview which files would be processed
export const previewFilesToProcess = async (githubUrl: string, githubToken?: string, maxFiles: number = 30) => {
  const docs = await loadGithubRepo(githubUrl, githubToken);
  const filtered = filterAndPrioritizeDocs(docs, maxFiles);
  
  return {
    totalFiles: docs.length,
    selectedFiles: filtered.map(doc => ({
      path: doc.metadata.source,
      size: doc.pageContent.length,
      preview: doc.pageContent.slice(0, 100) + '...'
    }))
  };
};