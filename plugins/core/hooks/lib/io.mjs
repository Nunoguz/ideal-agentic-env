// Hook I/O helpers. Every hook reads one JSON object from stdin and answers on stdout.
// Shared file: the source of truth is shared/hooks-lib/ in the marketplace repo (npm run sync).
// Two wrappers encode the fail policy (ADR-0002):
//   guard() — fail closed: any crash or bad input becomes a deny decision.
//   soft()  — fail open: any crash is reported on stderr and the action proceeds.

import { pluginName } from "./plugin.mjs";

export async function readInput(stream = process.stdin) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  return JSON.parse(text);
}

export function write(obj) {
  process.stdout.write(JSON.stringify(obj));
}

const RANK = { allow: 0, ask: 1, deny: 2 };

/** Pick the strictest of several {decision, reason} findings (deny > ask). */
export function strictest(findings) {
  return findings
    .filter(Boolean)
    .reduce((best, f) => (!best || RANK[f.decision] > RANK[best.decision] ? f : best), null);
}

export function preToolUse(decision, reason) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: decision,
      permissionDecisionReason: reason,
    },
  };
}

/** Fail-closed PreToolUse guard. `fn(input)` returns null (no opinion) or {decision, reason}. */
export async function guard(name, fn) {
  try {
    const input = await readInput();
    const finding = await fn(input);
    if (finding) write(preToolUse(finding.decision, `[${pluginName()}:${name}] ${finding.reason}`));
  } catch (err) {
    write(preToolUse("deny", `[${pluginName()}:${name}] guard failed, blocking for safety: ${err?.message ?? err}`));
  }
  process.exitCode = 0;
}

/** Fail-open hook. `fn(input)` may return an object to print as the hook's JSON output. */
export async function soft(name, fn) {
  try {
    const input = await readInput();
    const output = await fn(input);
    if (output) write(output);
  } catch (err) {
    process.stderr.write(`[${pluginName()}:${name}] skipped after error: ${err?.message ?? err}\n`);
  }
  process.exitCode = 0;
}
