#!/usr/bin/env node
// Stop — fail open. If this session changed the working tree, `scripts/verify.mjs --fast` must be green
// before Claude finishes. Blocks at most MAX_BLOCKS times in a row, then lets the stop through with a warning.
// When an attempt fails with exactly the same output as the blocked attempt before it, nothing changed that
// verify can see (typically a pre-existing failure outside the task), so the stop goes through with a warning
// instead of spending more turns on it.
import { isManaged } from "./lib/managed.mjs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "./lib/config.mjs";
import { soft } from "./lib/io.mjs";
import { projectDir } from "./lib/paths.mjs";
import { loadState, saveState, session, treeFingerprint } from "./lib/state.mjs";

const MAX_BLOCKS = 3;
const TAIL_LINES = 60;

/** Identity of a failure: the output without timings, so the same failure hashes the same on every run. */
export const failureKey = (text) =>
  createHash("sha256").update(text.replace(/\(\d+(?:\.\d+)?\s?m?s\)/g, "").replace(/\s+/g, " ").trim()).digest("hex").slice(0, 16);

await soft("verify-gate", (input) => {
  if (!isManaged(projectDir(input))) return null; // dormant until /core:init (lib/managed.mjs)
  const root = projectDir(input);
  const script = join(root, "scripts", "verify.mjs");
  if (!existsSync(script)) return null;

  const fp = treeFingerprint(root);
  if (!fp) return null; // not a git repo, or clean tree

  const state = loadState(root);
  const s = session(state, input.session_id);
  if (fp === s.baseline || fp === state.lastGreen) {
    saveState(root, state);
    return null; // nothing changed in this session, or already verified
  }

  const { timeoutSec } = loadConfig(root).verify;
  const r = spawnSync(process.execPath, [script, "--fast"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    timeout: Math.max(10, Number(timeoutSec) || 240) * 1000,
    maxBuffer: 32 * 1024 * 1024,
  });

  if (r.status === 0) {
    state.lastGreen = fp;
    s.blocks = 0;
    s.lastFailure = null;
    saveState(root, state);
    return null;
  }

  const tail = `${r.stdout ?? ""}\n${r.stderr ?? ""}`.trim().split(/\r?\n/).slice(-TAIL_LINES).join("\n");
  const why = r.error?.code === "ETIMEDOUT" ? `timed out after ${timeoutSec}s` : `exited with ${r.status}`;
  const key = failureKey(tail);
  if (s.blocks > 0 && s.lastFailure === key) {
    s.blocks = 0;
    s.lastFailure = null;
    saveState(root, state);
    return { systemMessage: "[core:verify-gate] verify --fast still fails with the same output as the previous attempt; stopping without a green verify." };
  }
  s.blocks = (s.blocks ?? 0) + 1;
  s.lastFailure = key;
  saveState(root, state);

  if (s.blocks > MAX_BLOCKS) {
    s.blocks = 0;
    saveState(root, state);
    return { systemMessage: `[core:verify-gate] verify --fast still failing after ${MAX_BLOCKS} attempts; stopping without a green verify.` };
  }
  return {
    decision: "block",
    reason:
      `[core:verify-gate] scripts/verify.mjs --fast ${why} (attempt ${s.blocks}/${MAX_BLOCKS}). ` +
      "Fix the cause before finishing. Never weaken, skip or delete tests to get green; if the failure is pre-existing " +
      "or out of scope, say so explicitly to the user instead.\n\n" +
      tail,
  };
});
