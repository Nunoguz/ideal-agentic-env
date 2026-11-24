#!/usr/bin/env node
// PostToolUse(Edit|Write|MultiEdit) — fail open. Runs the project's formatter for the edited file.
// Formatters come from `.claude/ideal-agentic-env.json` → "format": [{ "glob": "**/*.ts", "run": "npx prettier --write {file}" }].
import { isManaged } from "./lib/managed.mjs";
import { spawnSync } from "node:child_process";
import { loadConfig } from "./lib/config.mjs";
import { soft } from "./lib/io.mjs";
import { globToRegExp, isOutside, projectDir, relPosix } from "./lib/paths.mjs";

const UNSAFE = /["'`$%!;&|<>\r\n]/;

await soft("format-dispatch", (input) => {
  if (!isManaged(projectDir(input))) return null; // dormant until /core:init (lib/managed.mjs)
  const file = input.tool_input?.file_path;
  if (!file) return null;
  const root = projectDir(input);
  const rel = relPosix(root, file);
  if (isOutside(rel) || UNSAFE.test(rel)) return null;

  const failures = [];
  for (const { glob, run } of loadConfig(root).format) {
    if (!globToRegExp(glob, { nocase: process.platform === "win32" }).test(rel)) continue;
    const command = run.replaceAll("{file}", `"${rel}"`);
    const r = spawnSync(command, { cwd: root, shell: true, encoding: "utf8", windowsHide: true, timeout: 30000 }); // nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true -- the formatter command comes from the protected, CODEOWNERS-owned project config; a shell is needed for npx/.cmd on Windows; the path is checked against UNSAFE and quoted
    if (r.status !== 0) failures.push(`\`${command}\` exited ${r.status ?? "on timeout"}: ${(r.stderr || r.stdout || "").trim().slice(-800)}`);
  }
  if (!failures.length) return null;
  return { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: `[core:format-dispatch] formatter failed for ${rel}:\n${failures.join("\n")}` } };
});
