// Protected paths and immutable (merged) migrations.

import { spawnSync } from "node:child_process";
import { isOutside, matchesAny, relPosix } from "./paths.mjs";

function git(root, args) {
  const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", windowsHide: true, timeout: 5000 });
  return r.status === 0 ? r.stdout.trim() : null;
}

/** Refs that represent "merged": the remote default branch, falling back to main/master. */
export function mergedRefs(root) {
  const refs = [];
  const head = git(root, ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"]);
  if (head) refs.push(head);
  for (const r of ["refs/remotes/origin/main", "refs/remotes/origin/master", "refs/heads/main", "refs/heads/master"]) {
    if (!refs.includes(r) && git(root, ["rev-parse", "--verify", "--quiet", r]) !== null) refs.push(r);
  }
  return refs;
}

export function isMerged(root, rel) {
  return mergedRefs(root).some((ref) => git(root, ["cat-file", "-e", `${ref}:${rel}`]) !== null);
}

export function editedPath(toolInput = {}) {
  return toolInput.file_path ?? toolInput.notebook_path ?? null;
}

export function checkPath(root, file, cfg) {
  if (!file) return null;
  const rel = relPosix(root, file);
  if (isOutside(rel)) return null;
  const nocase = process.platform === "win32";

  const mutable = matchesAny(rel, cfg.migrationsMutable ?? [], { nocase: true });
  if (!mutable && matchesAny(rel, cfg.migrations, { nocase: true }) && isMerged(root, rel))
    return { decision: "deny", reason: `${rel} is a merged migration and is immutable; add a new migration instead` };

  if (matchesAny(rel, cfg.protectedPaths, { nocase }))
    return {
      decision: "ask",
      reason: `${rel} is a protected environment path (owned via CODEOWNERS). Approve only if you asked for this change; otherwise record it with the env-request skill`,
    };
  return null;
}
