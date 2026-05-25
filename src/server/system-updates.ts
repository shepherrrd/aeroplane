import { spawn } from "node:child_process";
import { config } from "./config.js";

export type SystemUpdateStatus = "current" | "available" | "diverged" | "unknown";
export type SystemUpdateRunStatus = "idle" | "running" | "succeeded" | "failed";

export interface SystemUpdateCommit {
  sha: string;
  shortSha: string;
  title: string;
  author: string;
  date: string;
  url: string | null;
}

export interface SystemUpdateRun {
  status: SystemUpdateRunStatus;
  startedAt: string | null;
  finishedAt: string | null;
  targetCommit: string | null;
  restartQueued: boolean;
  logs: string[];
  error: string | null;
}

export interface SystemUpdateInfo {
  repo: string;
  repoUrl: string;
  branch: string;
  currentCommit: string | null;
  currentShortCommit: string | null;
  remoteCommit: string | null;
  remoteShortCommit: string | null;
  status: SystemUpdateStatus;
  dirty: boolean;
  commits: SystemUpdateCommit[];
  checkedAt: string;
  error: string | null;
  updateRun: SystemUpdateRun;
}

interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

type CommandEnv = NodeJS.ProcessEnv;

const updateRemoteName = "aeroplane-updates";
let activeRun: SystemUpdateRun = idleRun();
let activeUpdate: Promise<void> | null = null;

function idleRun(): SystemUpdateRun {
  return {
    status: "idle",
    startedAt: null,
    finishedAt: null,
    targetCommit: null,
    restartQueued: false,
    logs: [],
    error: null
  };
}

function snapshotRun() {
  return { ...activeRun, logs: [...activeRun.logs] };
}

function nowIso() {
  return new Date().toISOString();
}

function shortSha(sha: string | null) {
  return sha ? sha.slice(0, 7) : null;
}

function remoteRef() {
  return `refs/remotes/${updateRemoteName}/${config.updateRepoBranch}`;
}

function repoLabel() {
  const match =
    config.updateRepoUrl.match(/^https:\/\/github\.com\/([^/]+\/[^/.]+)(?:\.git)?$/) ??
    config.updateRepoUrl.match(/^git@github\.com:([^/]+\/[^/.]+)(?:\.git)?$/);
  return match?.[1] ?? config.updateRepoUrl;
}

function commitUrl(sha: string) {
  const label = repoLabel();
  return label.includes("/") && !label.includes(":") ? `https://github.com/${label}/commit/${sha}` : null;
}

function commandForLog(command: string, args: string[]) {
  return [command, ...args].join(" ");
}

function commandEnv(overrides: CommandEnv = {}) {
  return {
    ...process.env,
    FORCE_COLOR: "0",
    NO_COLOR: "1",
    npm_config_color: "false",
    ...overrides
  };
}

function cleanCommandOutput(output: string) {
  return output
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

function appendLog(line: string) {
  activeRun.logs = [...activeRun.logs, line].slice(-160);
}

function runCommand(command: string, args: string[], envOverrides?: CommandEnv): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: commandEnv(envOverrides),
      shell: false
    });
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      stderr += error.message;
      resolve({ code: 1, stdout, stderr });
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function readCommand(command: string, args: string[]) {
  const result = await runCommand(command, args);
  if (result.code !== 0) {
    throw new Error(cleanCommandOutput(result.stderr || result.stdout || `${command} failed`));
  }
  return result.stdout.trim();
}

async function runLogged(command: string, args: string[], envOverrides?: CommandEnv) {
  appendLog(`$ ${commandForLog(command, args)}`);
  const result = await runCommand(command, args, envOverrides);
  const output = cleanCommandOutput(`${result.stdout}${result.stderr}`);
  if (output) {
    for (const line of output.split(/\r?\n/)) {
      appendLog(line);
    }
  }
  if (result.code !== 0) {
    throw new Error(output || `${command} failed`);
  }
}

async function fetchRemote(logged = false) {
  const args = ["fetch", "--quiet", config.updateRepoUrl, `refs/heads/${config.updateRepoBranch}:${remoteRef()}`];
  if (logged) {
    await runLogged("git", args);
    return;
  }
  await readCommand("git", args);
}

async function getCurrentCommit() {
  return readCommand("git", ["rev-parse", "HEAD"]);
}

async function getRemoteCommit() {
  return readCommand("git", ["rev-parse", remoteRef()]);
}

async function isWorkingTreeDirty() {
  return (await readCommand("git", ["status", "--porcelain"])).length > 0;
}

async function isAncestor(base: string, target: string) {
  const result = await runCommand("git", ["merge-base", "--is-ancestor", base, target]);
  return result.code === 0;
}

async function commitsBetween(base: string, target: string): Promise<SystemUpdateCommit[]> {
  const output = await readCommand("git", ["log", "--format=%H%x1f%h%x1f%an%x1f%aI%x1f%s", `${base}..${target}`]);
  if (!output) return [];

  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [sha = "", short = "", author = "", date = "", title = ""] = line.split("\x1f");
      return {
        sha,
        shortSha: short || shortSha(sha) || "",
        title,
        author,
        date,
        url: commitUrl(sha)
      };
    });
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function queueRestart() {
  const command = config.updateRestartCmd.trim();
  if (!command) return false;

  const child = spawn("sh", ["-lc", `sleep 1; ${command}`], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore"
  });
  child.unref();
  return true;
}

export async function getSystemUpdateInfo(): Promise<SystemUpdateInfo> {
  const checkedAt = nowIso();

  try {
    await fetchRemote();
    const [currentCommit, remoteCommit, dirty] = await Promise.all([getCurrentCommit(), getRemoteCommit(), isWorkingTreeDirty()]);
    const currentIsAncestor = currentCommit === remoteCommit ? true : await isAncestor(currentCommit, remoteCommit);
    const status: SystemUpdateStatus = currentCommit === remoteCommit ? "current" : currentIsAncestor ? "available" : "diverged";
    const commits = status === "available" ? await commitsBetween(currentCommit, remoteCommit) : [];

    return {
      repo: repoLabel(),
      repoUrl: config.updateRepoUrl,
      branch: config.updateRepoBranch,
      currentCommit,
      currentShortCommit: shortSha(currentCommit),
      remoteCommit,
      remoteShortCommit: shortSha(remoteCommit),
      status,
      dirty,
      commits,
      checkedAt,
      error: null,
      updateRun: snapshotRun()
    };
  } catch (error) {
    return {
      repo: repoLabel(),
      repoUrl: config.updateRepoUrl,
      branch: config.updateRepoBranch,
      currentCommit: null,
      currentShortCommit: null,
      remoteCommit: null,
      remoteShortCommit: null,
      status: "unknown",
      dirty: false,
      commits: [],
      checkedAt,
      error: error instanceof Error ? error.message : "Could not check updates",
      updateRun: snapshotRun()
    };
  }
}

async function runUpdate() {
  activeRun = {
    status: "running",
    startedAt: nowIso(),
    finishedAt: null,
    targetCommit: null,
    restartQueued: false,
    logs: ["Checking GitHub for Aeroplane updates..."],
    error: null
  };

  try {
    const dirty = await isWorkingTreeDirty();
    if (dirty) {
      throw new Error("Cannot update while the Aeroplane working tree has local changes.");
    }

    await fetchRemote(true);
    const currentCommit = await getCurrentCommit();
    const targetCommit = await getRemoteCommit();
    activeRun.targetCommit = targetCommit;

    if (currentCommit === targetCommit) {
      appendLog("Aeroplane is already on the latest commit.");
      activeRun.status = "succeeded";
      return;
    }

    const canFastForward = await isAncestor(currentCommit, targetCommit);
    if (!canFastForward) {
      throw new Error("The local checkout has diverged from GitHub. Manual update required.");
    }

    const commits = await commitsBetween(currentCommit, targetCommit);
    appendLog(`Applying ${commits.length} commit${commits.length === 1 ? "" : "s"} up to ${shortSha(targetCommit)}.`);
    await runLogged("git", ["merge", "--ff-only", targetCommit]);
    await runLogged(npmCommand(), ["ci", "--include=dev"], {
      NODE_ENV: "development",
      npm_config_production: "false"
    });
    await runLogged(npmCommand(), ["run", "build"]);

    if (queueRestart()) {
      activeRun.restartQueued = true;
      appendLog("Restart queued. Aeroplane will come back on the updated build.");
    } else {
      appendLog("Update built. Configure AEROPLANE_UPDATE_RESTART_CMD to restart automatically after updates.");
    }

    activeRun.status = "succeeded";
  } catch (error) {
    activeRun.error = error instanceof Error ? error.message : "Update failed";
    activeRun.status = "failed";
    appendLog(activeRun.error);
  } finally {
    activeRun.finishedAt = nowIso();
  }
}

export function startSystemUpdate() {
  if (!activeUpdate) {
    activeUpdate = runUpdate().finally(() => {
      activeUpdate = null;
    });
  }
  return snapshotRun();
}
