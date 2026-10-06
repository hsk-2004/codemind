import { Document } from '@langchain/core/documents';
import { getLLMProvider } from '@/services/llm';
import { getEmbeddingProvider } from '@/services/embedding';
import { breakingChangePrompt, codeSummaryPrompt, commitSummaryPrompt } from '@/services/llm/prompts';

/** Optional context used to attribute model calls in the Metrics dashboard. */
export interface AiContext {
  projectId?: string;
}

export const AisummariseCommit = async (diff: string, ctx: AiContext = {}, commitMessage = ''): Promise<string> => {
  try {
    const text = await getLLMProvider().generate(commitSummaryPrompt(diff, commitMessage), {
      temperature: 0.1,
      maxTokens: 900,
      operation: 'commit_summary',
      projectId: ctx.projectId,
    });
    if (!text) throw new Error('Empty response');
    return text;
  } catch (error) {
    console.error('Failed to summarize commit:', error);
    return extractBasicDiffSummary(diff);
  }
};

export interface BreakingChangeResult {
  /** False when the model could not be reached or returned unusable output. */
  analyzed: boolean;
  hasBreakingChanges: boolean;
  severity: string | null;
  details: string | null;
  affectedComponents: string[] | null;
  migrationRequired: boolean;
  migrationSteps: string | null;
}

export const detectBreakingChanges = async (
  diff: string,
  commitMessage: string,
  ctx: AiContext = {},
): Promise<BreakingChangeResult> => {
  try {
    const text = await getLLMProvider().generate(breakingChangePrompt(diff, commitMessage), {
      temperature: 0,
      maxTokens: 400,
      json: true,
      operation: 'breaking_change',
      projectId: ctx.projectId,
    });
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        analyzed: true,
        hasBreakingChanges: Boolean(parsed.hasBreakingChanges),
        severity: parsed.severity ?? null,
        details: parsed.details ?? null,
        affectedComponents: Array.isArray(parsed.affectedComponents) ? parsed.affectedComponents : null,
        migrationRequired: Boolean(parsed.migrationRequired),
        migrationSteps: parsed.migrationSteps ?? null,
      };
    }
    throw new Error('Invalid JSON response');
  } catch (error) {
    console.error('Failed to detect breaking changes:', error);
    return {
      analyzed: false,
      hasBreakingChanges: false,
      severity: null,
      details: null,
      affectedComponents: null,
      migrationRequired: false,
      migrationSteps: null,
    };
  }
};

/**
 * Summarises a commit, then checks it for breaking changes.
 *
 * The two calls run one after the other on purpose. Both prompts start with the
 * same commit message and diff, so Ollama reuses its cached state for the diff
 * on the second call and only has to read the short instructions.
 */
export async function analyzeCommitDiff(
  diff: string,
  commitMessage: string,
  ctx: AiContext = {},
): Promise<{ summary: string; breakingChanges: BreakingChangeResult }> {
  const summary = await AisummariseCommit(diff, ctx, commitMessage);
  const breakingChanges = await detectBreakingChanges(diff, commitMessage, ctx);
  return { summary, breakingChanges };
}

export async function summariseCode(doc: Document, ctx: AiContext = {}): Promise<string> {
  try {
    const text = await getLLMProvider().generate(codeSummaryPrompt(doc.metadata.source, doc.pageContent), {
      temperature: 0.1,
      maxTokens: 1000,
      operation: 'file_summary',
      projectId: ctx.projectId,
    });
    if (!text) throw new Error('Empty response');
    return text;
  } catch (error) {
    console.error(`Failed to summarize ${doc.metadata.source}:`, error);
    return extractBasicCodeSummary(doc);
  }
}

export async function generateEmbedding(text: string, ctx: AiContext = {}): Promise<number[] | null> {
  return getEmbeddingProvider(ctx.projectId).embed(text);
}

export function extractBasicDiffSummary(diff: string): string {
  const lines = diff.split('\n');
  const isHeader = (line: string) => line.startsWith('+++') || line.startsWith('---');
  const additions = lines.filter(line => line.startsWith('+') && !isHeader(line)).length;
  const deletions = lines.filter(line => line.startsWith('-') && !isHeader(line)).length;

  // "--- a/src/x.ts" and "+++ b/src/x.ts" name the same file; strip the a/ b/ prefixes.
  const filePattern = /^(?:\+\+\+|---)\s+(?:[ab]\/)?(.+)$/;
  const files = Array.from(new Set(
    lines
      .map(line => line.match(filePattern)?.[1]?.split('\t')[0] ?? '')
      .filter(filename => filename && filename !== '/dev/null')
  ));

  return `[AUTO] Changes: +${additions}/-${deletions} in ${files.length} files: ${files.slice(0, 2).join(', ')}${files.length > 2 ? '...' : ''}`;
}

function extractBasicCodeSummary(doc: Document): string {
  const filename = doc.metadata.source;
  const content = doc.pageContent;
  const lines = content.split('\n').length;

  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const typeMap: Record<string, string> = {
    'js': 'JavaScript', 'ts': 'TypeScript', 'py': 'Python',
    'java': 'Java', 'cpp': 'C++', 'c': 'C', 'html': 'HTML',
    'css': 'CSS', 'json': 'Config', 'yml': 'Config', 'yaml': 'Config'
  };

  const fileType = typeMap[ext] || 'Code';
  return `${fileType} file (${lines} lines) - Analysis unavailable (LLM error).`;
}
