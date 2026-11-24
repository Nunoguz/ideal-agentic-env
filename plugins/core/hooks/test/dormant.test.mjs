// core may be installed for the whole user; its hooks act only in projects set up with /core:init
// (lib/managed.mjs). Block path: a managed project and its subdirectories. Allow path: any other project.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { decisionOf, runHook, tempDir } from "./helpers.mjs";

const env = (root) => ({ CLAUDE_PROJECT_DIR: root, CLAUDE_PLUGIN_DATA: tempDir("iae-data-") });
const checks = (root) => ({
  shell: decisionOf(runHook("shell-guard.mjs", { tool_name: "Bash", tool_input: { command: "rm -rf /" } }, { env: env(root) })),
  read: decisionOf(runHook("read-guard.mjs", { tool_name: "Read", tool_input: { file_path: join(root, ".env") } }, { env: env(root) })),
  edit: decisionOf(runHook("edit-guard.mjs", { tool_name: "Write", tool_input: { file_path: join(root, ".github/workflows/ci.yml"), content: "x" } }, { env: env(root) })),
});

test("dormant: guards act in a managed project and below it", () => {
  const root = tempDir();
  assert.deepEqual(checks(root), { shell: "deny", read: "deny", edit: "ask" });
  const sub = join(root, "services", "api");
  mkdirSync(sub, { recursive: true });
  assert.equal(checks(sub).shell, "deny", "a session opened in a subdirectory is still guarded");
});

test("dormant: in a project without /core:init every guard stays out of the way", () => {
  const root = tempDir("iae-plain-", { managed: false });
  assert.deepEqual(checks(root), { shell: "allow", read: "allow", edit: "allow" });
});

test("dormant: bad input still fails closed, managed or not", () => {
  const root = tempDir("iae-plain-", { managed: false });
  assert.equal(decisionOf(runHook("shell-guard.mjs", "{not json", { env: env(root) })), "deny");
});

test("dormant: session context is one hint line without the constitution", () => {
  const plain = runHook("session-context.mjs", { source: "startup", session_id: "s" }, { env: env(tempDir("iae-plain-", { managed: false })) });
  const text = plain.json?.hookSpecificOutput?.additionalContext ?? "";
  assert.match(text, /suggest \/core:init/);
  assert.ok(text.length < 300, "no constitution outside managed projects");
  const managed = runHook("session-context.mjs", { source: "startup", session_id: "s" }, { env: env(tempDir()) });
  assert.ok((managed.json?.hookSpecificOutput?.additionalContext ?? "").length > 1000, "the constitution is injected in managed projects");
});
