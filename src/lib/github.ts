import { Octokit } from 'octokit';
import { db } from '@/server/db';
import { analyzeCommitDiff } from './ai';
import { parseGithubUrl } from './github-url';
import { formatDuration, noopReporter, type ProgressReporter } from './indexing-progress';

export const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

type Response = {
  commitMessage: string;
  commitHash: string;
  commitAuthorName: string;
  commitAuthorAvatar: string;
  commitDate: string;
};

export const getCommitHashes = async (githubUrl: string): Promise<Response[]> => {
  const { owner, repo } = parseGithubUrl(githubUrl);
  const { data } = await octokit.rest.repos.listCommits({
    owner,
    repo,
  });

  const sortedCommits = data.sort(
    (a: any, b: any) =>
      new Date(b.commit.author.date).getTime() -
      new Date(a.commit.author.date).getTime()
  ) as any[];

  return sortedCommits.slice(0, 20).map((commit: any) => ({
    commitHash: commit.sha as string,
    commitMessage: commit.commit?.message ?? ' ',
    commitAuthorName: commit.commit?.author?.name ?? ' ',
    commitAuthorAvatar: commit?.author?.avatar_url ?? ' ',
    commitDate: commit.commit?.author?.date ?? ' ',
  }));
};

export const pollCommits = async (projectId: string, reporter: ProgressReporter = noopReporter) => {
  const { githubUrl } = await FetchProjectGithubUrl(projectId);
  reporter.stage('commits', 'Fetching recent commits from GitHub');
  const commitHashes = await getCommitHashes(githubUrl);
  const unprocessedCommits = await filterUnprocessedCommits(
    projectId,
    commitHashes
  );

  // Select all 20 unprocessed commits for summarization
  const commitsToSummarize = unprocessedCommits.slice(0, 20);
  reporter.set({ commitsFound: commitsToSummarize.length });
  reporter.log(`${commitHashes.length} recent commits, ${commitsToSummarize.length} not yet analysed`);

  // One commit at a time. The local GPU runs a single generation at a time, so
  // parallel requests only queue up inside Ollama, and running each commit's two
  // prompts back to back lets the second one reuse the cached diff.
  const commitAnalyses: PromiseSettledResult<Awaited<ReturnType<typeof analyzeCommit>>>[] = [];
  for (const commit of commitsToSummarize) {
    const started = Date.now();
    const title = (commit.commitMessage.split('\n')[0] ?? '').slice(0, 60);
    reporter.set({ currentItem: `${commit.commitHash.slice(0, 7)} ${title}` });
    const result = await analyzeCommit(githubUrl, commit.commitHash, commit.commitMessage);
    reporter.increment('commitsAnalyzed');
    if (result.breakingChanges.hasBreakingChanges) {
      reporter.increment('breakingFound');
      reporter.log(`${commit.commitHash.slice(0, 7)} "${title}" — breaking change (${result.breakingChanges.severity ?? 'unknown'}), ${formatDuration(Date.now() - started)}`, 'warn');
    } else {
      reporter.log(`${commit.commitHash.slice(0, 7)} "${title}" — analysed in ${formatDuration(Date.now() - started)}`, 'success');
    }
    commitAnalyses.push({ status: 'fulfilled', value: result });
  }
  reporter.set({ currentItem: null });

  const commits = await db.commit.createMany({
    data: commitAnalyses.map((response, index) => {
      if (response.status === 'fulfilled') {
        const { summary, breakingChanges } = response.value;
        return {
          projectId: projectId,
          commitHash: commitsToSummarize[index]!.commitHash,
          commitMessage: commitsToSummarize[index]!.commitMessage,
          commitAuthorName: commitsToSummarize[index]!.commitAuthorName,
          commitAuthorAvatar: commitsToSummarize[index]!.commitAuthorAvatar,
          commitDate: commitsToSummarize[index]!.commitDate,
          summary: summary || ' ',
          hasBreakingChanges: breakingChanges.hasBreakingChanges,
          breakingChangeSeverity: breakingChanges.severity,
          breakingChangeDetails: breakingChanges.details,
          affectedComponents: breakingChanges.affectedComponents ? JSON.stringify(breakingChanges.affectedComponents) : null,
          migrationRequired: breakingChanges.migrationRequired,
          migrationSteps: breakingChanges.migrationSteps,
        };
      }
      // Fallback for failed analysis
      return {
        projectId: projectId,
        commitHash: commitsToSummarize[index]!.commitHash,
        commitMessage: commitsToSummarize[index]!.commitMessage,
        commitAuthorName: commitsToSummarize[index]!.commitAuthorName,
        commitAuthorAvatar: commitsToSummarize[index]!.commitAuthorAvatar,
        commitDate: commitsToSummarize[index]!.commitDate,
        summary: ' ',
        hasBreakingChanges: false,
        breakingChangeSeverity: null,
        breakingChangeDetails: null,
        affectedComponents: null,
        migrationRequired: false,
        migrationSteps: null,
      };
    }),
  });

  return commits;

  async function analyzeCommit(githubUrl: string, commitHash: string, commitMessage: string) {
    try {
      const { owner, repo } = parseGithubUrl(githubUrl);

      const { data: commitData } = await octokit.rest.repos.getCommit({
        owner,
        repo,
        ref: commitHash,
      });

      // Create a diff-like string from the commit data
      let diffContent = `Commit: ${commitData.commit.message}\n\n`;
      
      if (commitData.files) {
        for (const file of commitData.files) {
          diffContent += `diff --git a/${file.filename} b/${file.filename}\n`;
          diffContent += `--- a/${file.filename}\n`;
          diffContent += `+++ b/${file.filename}\n`;
          
          if (file.patch) {
            diffContent += file.patch + '\n';
          } else if (file.status === 'added') {
            diffContent += `+ New file added\n`;
          } else if (file.status === 'removed') {
            diffContent += `- File removed\n`;
          }
          diffContent += '\n';
        }
      }

      // One model call returns both the summary and the breaking-change verdict,
      // so the diff is read once instead of twice.
      return await analyzeCommitDiff(diffContent, commitMessage, { projectId });
    } catch (error) {
      console.error(`Error analyzing commit ${commitHash}:`, error);
      return {
        summary: ' ',
        breakingChanges: {
          hasBreakingChanges: false,
          severity: null,
          details: null,
          affectedComponents: null,
          migrationRequired: false,
          migrationSteps: null,
        }
      };
    }
  }

  async function FetchProjectGithubUrl(projectId: string) {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: {
        githubUrl: true,
      },
    });
    if (!project?.githubUrl) {
      throw new Error('Project has no github Url');
    }

    return { project, githubUrl: project?.githubUrl };
  }
};

async function filterUnprocessedCommits(
  projectId: string,
  commitHashes: Response[]
) {
  const processedCommits = await db.commit.findMany({
    where: { projectId },
  });
  const unprocessedCommits = commitHashes.filter(
    (commit) =>
      !processedCommits.some(
        (processedCommit) => processedCommit.commitHash === commit.commitHash
      )
  );

  return unprocessedCommits;
}