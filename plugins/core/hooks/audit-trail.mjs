#!/usr/bin/env node
// PostToolUse(all) — fail open, async. Local, content-free trail of agent actions (SOC 2 / ISO 27001 support evidence).
// Writes .claude/audit/<YYYY-MM>.jsonl in the project. Never records file contents or full commands.
import { isManaged } from "./lib/managed.mjs";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { soft } from "./lib/io.mjs";
import { isOutside, projectDir, relPosix } from "./lib/paths.mjs";
import { splitSegments } from "./lib/shell.mjs";
import { sha } from "./lib/state.mjs";

await soft("audit-trail", (input) => {
  if (!isManaged(projectDir(input))) return null; // dormant until /core:init (lib/managed.mjs)
  const root = projectDir(input);
  const ti = input.tool_input ?? {};
  const entry = { ts: new Date().toISOString(), session: input.session_id ?? null, tool: input.tool_name ?? null };

  const file = ti.file_path ?? ti.notebook_path;
  if (file) {
    const rel = relPosix(root, file);
    entry.path = isOutside(rel) ? "<outside-project>" : rel;
  }
  if (typeof ti.command === "string") {
    entry.programs = [...new Set(splitSegments(ti.command).map((s) => s.program).filter(Boolean))];
    entry.command_sha = sha(ti.command, 16);
  }
  if (typeof ti.url === "string") {
    try {
      entry.host = new URL(ti.url).host;
    } catch {
      /* not a URL */
    }
  }

  const dir = join(root, ".claude", "audit");
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, `${entry.ts.slice(0, 7)}.jsonl`), `${JSON.stringify(entry)}\n`);
  return null;
});
