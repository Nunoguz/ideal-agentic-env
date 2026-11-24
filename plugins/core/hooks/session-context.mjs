#!/usr/bin/env node
// SessionStart — fail open. Injects the engineering constitution and a short project status,
// and records the working-tree baseline so verify-gate only gates changes made in this session.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_PATH } from "./lib/config.mjs";
import { soft } from "./lib/io.mjs";
import { isManaged } from "./lib/managed.mjs";
import { projectDir } from "./lib/paths.mjs";
import { gitInfo, loadState, saveState, session, treeFingerprint } from "./lib/state.mjs";

const CONSTITUTION = fileURLToPath(new URL("../constitution.md", import.meta.url));
const MIN_NODE_MAJOR = 20;

function recentPlans(root, limit = 3) {
  const dir = join(root, "docs", "plans");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md")
    .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
    .slice(0, limit)
    .map((x) => `docs/plans/${x.f}`);
}

await soft("session-context", (input) => {
  const root = projectDir(input);
  // Dormant outside a managed project (lib/managed.mjs): one line, no constitution.
  if (!isManaged(root))
    return { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "ideal-agentic-env (core) is installed but this project is not set up for it. If the user asks to set up the project or its engineering environment, suggest /core:init." } };
  const lines = [];

  const info = gitInfo(root);
  if (info) lines.push(`- Branch: ${info.branch}; ${info.dirty} changed file(s) in the working tree.`);
  else lines.push("- Not a git repository.");

  const plans = recentPlans(root);
  if (plans.length) lines.push(`- Most recent plans: ${plans.join(", ")}. Read one only if the task refers to it.`);

  const initialized = existsSync(join(root, CONFIG_PATH));
  const hasVerify = existsSync(join(root, "scripts", "verify.mjs"));
  if (!initialized || !hasVerify)
    lines.push("- This project is not initialized for ideal-agentic-env. Suggest running /core:init before substantial work.");
  else lines.push("- Fast check: `node scripts/verify.mjs --fast`. Full gate before a PR: `node scripts/verify.mjs --full`.");

  const major = Number(process.versions.node.split(".")[0]);
  if (major < MIN_NODE_MAJOR) lines.push(`- WARNING: Node ${process.versions.node} is older than ${MIN_NODE_MAJOR}; core hooks may misbehave. Tell the user.`);

  if (input.source === "startup" || input.source === "clear" || !input.source) {
    const state = loadState(root);
    session(state, input.session_id).baseline = treeFingerprint(root);
    saveState(root, state);
  }

  const constitution = readFileSync(CONSTITUTION, "utf8").trim();
  return {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: `${constitution}\n\n## Session status\n${lines.join("\n")}`,
    },
  };
});
