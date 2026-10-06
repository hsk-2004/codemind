export interface GithubRepoRef {
  owner: string;
  repo: string;
}

const GITHUB_URL = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?(?:[?#].*)?$/;

/** Parses https://github.com/owner/repo (with optional .git, trailing slash, query). */
export function parseGithubUrl(url: string): GithubRepoRef {
  const match = url.trim().match(GITHUB_URL);
  if (!match?.[1] || !match[2]) {
    throw new Error(`Invalid GitHub repository URL: ${url}`);
  }
  return { owner: match[1], repo: match[2] };
}
