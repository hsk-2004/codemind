import { parseGithubUrl } from "./github-url";
import { octokit } from "./github";

export interface RepoTree {
  defaultBranch: string;
  paths: string[];
  /** GitHub truncates very large trees (>100k entries / 7 MB). */
  truncated: boolean;
}

export async function fetchRepoTree(githubUrl: string): Promise<RepoTree> {
  const { owner, repo } = parseGithubUrl(githubUrl);
  const { data: repoInfo } = await octokit.rest.repos.get({ owner, repo });
  const { data: tree } = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: repoInfo.default_branch,
    recursive: "true",
  });

  return {
    defaultBranch: repoInfo.default_branch,
    paths: tree.tree.filter((entry) => entry.type === "blob" && entry.path).map((entry) => entry.path!),
    truncated: tree.truncated,
  };
}
