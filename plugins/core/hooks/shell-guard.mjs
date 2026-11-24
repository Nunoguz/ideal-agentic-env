#!/usr/bin/env node
// PreToolUse(Bash|PowerShell) — fail closed. Dangerous commands, secret-file reads, and shell writes to
// protected paths or merged migrations (the same rules edit-guard applies to Edit and Write).
import { isManaged } from "./lib/managed.mjs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { checkCommand } from "./lib/command-rules.mjs";
import { loadConfig } from "./lib/config.mjs";
import { guard, strictest } from "./lib/io.mjs";
import { checkPath } from "./lib/path-rules.mjs";
import { projectDir } from "./lib/paths.mjs";
import { checkShellForSecrets } from "./lib/secret-rules.mjs";
import { shellWriteTargets } from "./lib/shell-writes.mjs";

/** Current branch of `dir`, or null (detached HEAD, not a repo, git missing). */
function currentBranch(dir) {
  const r = spawnSync("git", ["-C", dir, "rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8", windowsHide: true, timeout: 5000 });
  const name = r.status === 0 ? r.stdout.trim() : "";
  return name && name !== "HEAD" ? name : null;
}

/** A shell target may be a file or a directory (`rm -r .github`, `cp x .claude`): check both readings. */
function checkShellTarget(root, abs, cfg) {
  const direct = checkPath(root, abs, cfg);
  if (direct) return direct;
  const inside = checkPath(root, join(abs, "*"), cfg);
  return inside && { ...inside, reason: inside.reason.replace("/* ", "/ ") };
}

await guard("shell-guard", (input) => {
  if (!isManaged(projectDir(input))) return null; // dormant until /core:init (lib/managed.mjs)
  const command = input.tool_input?.command;
  const root = projectDir(input);
  const cfg = loadConfig(root);
  // Only a push needs the branch; skip the git call for every other command.
  const ctx = { guarded: cfg.guardedCommands, ...(typeof command === "string" && /\bpush\b/.test(command) ? { currentBranch: currentBranch(input.cwd || root) } : {}) };
  const cwd = input.cwd || root;
  const writes = shellWriteTargets(command).map((t) => checkShellTarget(root, resolve(cwd, t), cfg));
  return strictest([...checkCommand(command, ctx), ...checkShellForSecrets(command, cfg, root), ...writes]);
});
