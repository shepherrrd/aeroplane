import type { GitHubDirectory, GitHubRepo } from "../api";

export const githubReposCache = new Map<string, GitHubRepo[]>();
export const githubBranchesCache = new Map<string, string[]>();
export const githubDirectoriesCache = new Map<string, GitHubDirectory[]>();
