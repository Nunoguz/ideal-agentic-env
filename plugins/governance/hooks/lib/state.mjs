// Small per-project state for hooks, kept outside the repository and across plugin updates.
// Shared file: the source of truth is shared/hooks-lib/ in the marketplace repo (npm run sync).

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pluginName } from "./plugin.mjs";

const MAX_SESSIONS = 20;

export function sha(text, len = 64) {
  return createHash("sha256").update(text).digest("hex").slice(0, len);
}

function stateFile(root) {
  const dir = process.env.CLAUDE_PLUGIN_DATA || join(tmpdir(), "ideal-agentic-env", pluginName());
  mkdirSync(dir, { recursive: true });
  return join(dir, `state-${sha(root, 16)}.json`);
}

export function loadState(root) {
  const f = stateFile(root);
  if (!existsSync(f)) return { sessions: {} };
  try {
    const s = JSON.parse(readFileSync(f, "utf8"));
    return s && typeof s === "object" && s.sessions ? s : { sessions: {} };
  } catch {
    return { sessions: {} };
  }
}

export function saveState(root, state) {
  const ids = Object.keys(state.sessions);
  if (ids.length > MAX_SESSIONS) {
    ids
      .sort((a, b) => (state.sessions[a].touched ?? 0) - (state.sessions[b].touched ?? 0))
      .slice(0, ids.length - MAX_SESSIONS)
      .forEach((id) => delete state.sessions[id]);
  }
  writeFileSync(stateFile(root), JSON.stringify(state));
}

export function session(state, id) {
  const key = id || "unknown";
  state.sessions[key] ??= {};
  state.sessions[key].touched = Date.now();
  return state.sessions[key];
}

function git(root, args) {
  const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", windowsHide: true, timeout: 10000, maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
}

/** Fingerprint of the working tree relative to HEAD, or null outside git. "" means clean. */
export function treeFingerprint(root) {
  const status = git(root, ["status", "--porcelain=v1", "-uall"]);
  if (status === null) return null;
  if (!status.trim()) return "";
  const diff = git(root, ["diff", "HEAD", "--no-color", "--no-ext-diff"]) ?? "";
  const untracked = status
    .split("\n")
    .filter((l) => l.startsWith("??"))
    .map((l) => l.slice(3))
    .map((p) => {
      try {
        return `${p}:${sha(readFileSync(join(root, p)), 16)}`;
      } catch {
        return p;
      }
    })
    .join("\n");
  return sha(`${status}\n${diff}\n${untracked}`);
}

export function gitInfo(root) {
  const branch = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch === null) return null;
  const status = git(root, ["status", "--porcelain=v1"]) ?? "";
  return { branch: branch.trim(), dirty: status.split("\n").filter(Boolean).length };
}
