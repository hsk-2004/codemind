/**
 * How much of a commit diff is sent to the model. Sized for the context window
 * (LLM_NUM_CTX, 3072 tokens by default): about 1,700 tokens of diff, plus the
 * instructions and the answer. Larger diffs overflowed the window, and the
 * model lost its instructions.
 */
export const COMMIT_DIFF_MAX_CHARS = 6000;

/**
 * Shared opening of both commit prompts. Because the two prompts for a commit
 * begin with exactly the same text, Ollama reuses its cached state for the diff
 * on the second call instead of reading the diff again. Keep the task-specific
 * instructions AFTER this prefix.
 */
export function commitDiffPrefix(diff: string, commitMessage: string): string {
  const truncated = diff.length > COMMIT_DIFF_MAX_CHARS ? diff.slice(0, COMMIT_DIFF_MAX_CHARS) + "\n... (truncated)" : diff;
  return `Commit message: ${commitMessage}

Diff:
\`\`\`diff
${truncated}
\`\`\`

`;
}

export function commitSummaryPrompt(diff: string, commitMessage = ""): string {
  return `${commitDiffPrefix(diff, commitMessage)}Analyze the Git diff above and provide a detailed summary of the changes and their impact on the codebase.

FORMAT: [TYPE] description | Key files: file1, file2 | Impact: detailed 3 line impact
KEY Changes or Additions: describe the changes or additions in the codebase
TYPES: feat, fix, refactor, docs, style, test, chore, perf, build, ci, revert, security, other
`;
}

export function breakingChangePrompt(diff: string, commitMessage: string): string {
  return `${commitDiffPrefix(diff, commitMessage)}Analyze the commit diff above for breaking changes.

Breaking change indicators:
- Removed/renamed public APIs
- Changed function signatures
- Modified database schemas
- Removed config options
- Changed return types

Respond with ONLY a JSON object with exactly these fields, and no other text:
- hasBreakingChanges: true or false
- severity: one of "low", "medium", "high", "critical", or null if hasBreakingChanges is false
- details: a short string description, or null
- affectedComponents: an array of strings naming affected files/APIs, or null
- migrationRequired: true or false
- migrationSteps: a short string describing what a consumer must do, or null

Example of a valid response for a commit that removed a public function:
{"hasBreakingChanges": true, "severity": "high", "details": "Removed the exported function getUser from api/users.ts", "affectedComponents": ["api/users.ts"], "migrationRequired": true, "migrationSteps": "Replace calls to getUser with getUserById"}

Example of a valid response for a commit with no breaking changes:
{"hasBreakingChanges": false, "severity": null, "details": null, "affectedComponents": null, "migrationRequired": false, "migrationSteps": null}
`;
}

/** How much of a file is sent for summarisation. */
export const CODE_SUMMARY_MAX_CHARS = 6000;

export function codeSummaryPrompt(fileName: string, code: string): string {
  const truncated = code.slice(0, CODE_SUMMARY_MAX_CHARS);
  return `Explain ${fileName} in exactly 40 words or less. Focus on PURPOSE and KEY FUNCTIONALITY:

${truncated}
`;
}
