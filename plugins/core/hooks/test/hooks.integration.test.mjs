// End-to-end: spawn each hook exactly as Claude Code does (JSON on stdin, JSON on stdout).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { decisionOf, git, makeRepo, runHook, tempDir, writeFile } from "./helpers.mjs";

const env = (root) => ({ CLAUDE_PROJECT_DIR: root, CLAUDE_PLUGIN_DATA: tempDir("iae-data-") });

test("shell-guard: deny decision uses the PreToolUse JSON protocol", () => {
  const root = tempDir();
  const r = runHook("shell-guard.mjs", { tool_name: "Bash", tool_input: { command: "rm -rf /" } }, { env: env(root) });
  assert.equal(r.status, 0);
  assert.equal(r.json.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.equal(decisionOf(r), "deny");
  assert.match(r.json.hookSpecificOutput.permissionDecisionReason, /^\[core:shell-guard\]/);
});

test("shell-guard: a bare git push on a protected branch asks, on a feature branch it is allowed", () => {
  const root = makeRepo();
  const e = env(root);
  const push = () => decisionOf(runHook("shell-guard.mjs", { tool_name: "Bash", cwd: root, tool_input: { command: "git push" } }, { env: e }));
  assert.equal(push(), "ask");
  git(root, "switch", "-q", "-c", "feat/1-x");
  assert.equal(push(), "allow");
});

test("shell-guard: shell writes to protected paths ask, merged migrations deny, ordinary files pass", () => {
  const root = makeRepo({ "db/migrations/0001_init.sql": "create table t(id int);\n" });
  const e = env(root);
  const run = (command) => runHook("shell-guard.mjs", { tool_name: "Bash", cwd: root, tool_input: { command } }, { env: e });
  for (const command of [
    "cat <<'EOF' > .github/workflows/ci.yml\non: push\nEOF",
    "sed -i 's/a/b/' CLAUDE.md",
    "printf x | tee .claude/settings.json",
    "rm -rf .github",
    "cp /tmp/pre-push .githooks/",
  ]) {
    const r = run(command);
    assert.equal(decisionOf(r), "ask", command);
    assert.match(r.json.hookSpecificOutput.permissionDecisionReason, /protected environment path/, command);
  }
  assert.equal(decisionOf(run("echo 'drop table t;' > db/migrations/0001_init.sql")), "deny");
  assert.equal(decisionOf(run("echo 'create table u(id int);' > db/migrations/0002_add.sql")), "allow");
  assert.equal(decisionOf(run("echo ok > src/out.txt && npm test 2>&1 | tee build.log")), "allow");
});

test("shell-guard: safe commands produce no output", () => {
  const r = runHook("shell-guard.mjs", { tool_name: "Bash", tool_input: { command: "npm test" } }, { env: env(tempDir()) });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});

test("guards fail closed on malformed input", () => {
  for (const hook of ["shell-guard.mjs", "read-guard.mjs", "edit-guard.mjs"]) {
    const r = runHook(hook, "{not json", { env: env(tempDir()) });
    assert.equal(decisionOf(r), "deny", hook);
    assert.match(r.json.hookSpecificOutput.permissionDecisionReason, /blocking for safety/);
  }
});

test("read-guard: secret files are denied, normal files allowed", () => {
  const root = tempDir();
  assert.equal(decisionOf(runHook("read-guard.mjs", { tool_name: "Read", tool_input: { file_path: join(root, ".env") } }, { env: env(root) })), "deny");
  assert.equal(decisionOf(runHook("read-guard.mjs", { tool_name: "Read", tool_input: { file_path: join(root, "src", "a.ts") } }, { env: env(root) })), "allow");
});

test("edit-guard: merged migrations are immutable, new ones are allowed", () => {
  const root = makeRepo({ "db/migrations/0001_init.sql": "create table t(id int);\n" });
  const e = env(root);
  const edit = (rel) => runHook("edit-guard.mjs", { tool_name: "Edit", tool_input: { file_path: join(root, rel), new_string: "x" } }, { env: e });
  assert.equal(decisionOf(edit("db/migrations/0001_init.sql")), "deny");
  assert.equal(decisionOf(edit("db/migrations/0002_add.sql")), "allow");
});

test("edit-guard: tool-managed files in migration folders stay editable after merge", () => {
  const root = makeRepo({
    "drizzle/migrations/meta/_journal.json": "{}\n",
    "db/migration/R__views.sql": "create view v as select 1;\n",
    "db/migration/V1__init.sql": "create table t(id int);\n",
  });
  const e = env(root);
  const edit = (rel) => runHook("edit-guard.mjs", { tool_name: "Edit", tool_input: { file_path: join(root, rel), new_string: "x" } }, { env: e });
  assert.equal(decisionOf(edit("drizzle/migrations/meta/_journal.json")), "allow");
  assert.equal(decisionOf(edit("db/migration/R__views.sql")), "allow");
  assert.equal(decisionOf(edit("db/migration/V1__init.sql")), "deny");
});

test("edit-guard: protected paths ask, ordinary source is allowed", () => {
  const root = makeRepo();
  const e = env(root);
  const write = (rel, content = "x") => runHook("edit-guard.mjs", { tool_name: "Write", tool_input: { file_path: join(root, rel), content } }, { env: e });
  assert.equal(decisionOf(write(".github/workflows/ci.yml")), "ask");
  assert.equal(decisionOf(write(".github/scripts/change-audit.mjs")), "ask");
  assert.equal(decisionOf(write(".githooks/pre-push")), "ask");
  assert.equal(decisionOf(write("CLAUDE.md")), "ask");
  assert.equal(decisionOf(write("src/index.ts")), "allow");
  assert.equal(decisionOf(write("src/keys.ts", `export const k = "${"AKIA" + "Z".repeat(16)}";`)), "deny");
});

test("audit-trail: records tool and path, never contents or full commands", () => {
  const root = tempDir();
  const e = env(root);
  runHook("audit-trail.mjs", { session_id: "s1", tool_name: "Write", tool_input: { file_path: join(root, "src", "a.ts"), content: "TOP-SECRET-CONTENT" } }, { env: e });
  runHook("audit-trail.mjs", { session_id: "s1", tool_name: "Bash", tool_input: { command: "npm test -- --token=hunter2" } }, { env: e });
  const dir = join(root, ".claude", "audit");
  const lines = readdirSync(dir).flatMap((f) => readFileSync(join(dir, f), "utf8").trim().split("\n"));
  const text = lines.join("\n");
  assert.equal(lines.length, 2);
  assert.ok(!text.includes("TOP-SECRET-CONTENT"));
  assert.ok(!text.includes("hunter2"));
  const [w, b] = lines.map((l) => JSON.parse(l));
  assert.equal(w.path, "src/a.ts");
  assert.deepEqual(b.programs, ["npm"]);
  assert.equal(b.command_sha.length, 16);
});

test("session-context: injects the constitution and status", () => {
  const root = makeRepo();
  const r = runHook("session-context.mjs", { session_id: "s1", source: "startup" }, { env: env(root) });
  const ctx = r.json.hookSpecificOutput.additionalContext;
  assert.equal(r.json.hookSpecificOutput.hookEventName, "SessionStart");
  assert.match(ctx, /Engineering Constitution/);
  assert.match(ctx, /Branch: main/);
  assert.match(ctx, /not initialized/);
});

test("verify-gate: blocks on red verify for session changes, passes when green, then stays quiet", () => {
  const verify = "import { existsSync } from 'node:fs';\nif (existsSync('FAIL')) { console.log('1 test failed'); process.exit(1); }\nconsole.log('ok');\n";
  const root = makeRepo({ "scripts/verify.mjs": verify, "src/a.js": "1\n" });
  const e = env(root);
  const stop = () => runHook("verify-gate.mjs", { session_id: "s1", stop_hook_active: false }, { env: e });

  runHook("session-context.mjs", { session_id: "s1", source: "startup" }, { env: e });
  assert.equal(stop().stdout, "", "clean tree: nothing to verify");

  writeFile(root, "src/a.js", "2\n");
  writeFile(root, "FAIL", "");
  const red = stop();
  assert.equal(red.json?.decision, "block");
  assert.match(red.json.reason, /1 test failed/);

  rmSync(join(root, "FAIL"));
  assert.equal(stop().stdout, "", "green verify lets the stop through");
  assert.equal(stop().stdout, "", "unchanged tree is not re-verified");
});

test("verify-gate: gives up after repeated, changing failures with a warning", () => {
  // Each run fails differently (the attempt counter changes), as when the model is trying fixes.
  const verify = "import { readFileSync, writeFileSync } from 'node:fs';\nlet n = 0; try { n = Number(readFileSync('n.txt', 'utf8')); } catch {}\nwriteFileSync('n.txt', String(n + 1));\nconsole.log(`failure ${n}`); process.exit(1);\n";
  const root = makeRepo({ "scripts/verify.mjs": verify });
  const e = env(root);
  runHook("session-context.mjs", { session_id: "s2", source: "startup" }, { env: e });
  writeFile(root, "new.txt", "x");
  const results = Array.from({ length: 4 }, () => runHook("verify-gate.mjs", { session_id: "s2" }, { env: e }));
  assert.deepEqual(results.slice(0, 3).map((r) => r.json?.decision), ["block", "block", "block"]);
  assert.match(results[3].json.systemMessage, /still failing/);
});

test("verify-gate: an identical failure on the next attempt lets the stop through after one block", () => {
  const root = makeRepo({ "scripts/verify.mjs": "console.log('lint: no eslint config (0.1s)'); process.exit(1);\n" });
  const e = env(root);
  runHook("session-context.mjs", { session_id: "s4", source: "startup" }, { env: e });
  writeFile(root, "new.txt", "x");
  const first = runHook("verify-gate.mjs", { session_id: "s4" }, { env: e });
  assert.equal(first.json?.decision, "block");
  const second = runHook("verify-gate.mjs", { session_id: "s4" }, { env: e });
  assert.equal(second.json?.decision, undefined);
  assert.match(second.json.systemMessage, /same output as the previous attempt/);
});

test("verify-gate: no-op without scripts/verify.mjs", () => {
  const root = makeRepo();
  writeFile(root, "x.txt", "x");
  assert.equal(runHook("verify-gate.mjs", { session_id: "s3" }, { env: env(root) }).stdout, "");
});

test("format-dispatch: runs configured formatter and reports failures as context", () => {
  const root = makeRepo();
  writeFile(root, ".claude/ideal-agentic-env.json", JSON.stringify({ format: [
    { glob: "**/*.txt", run: `node -e "require('fs').appendFileSync(process.argv[1], 'formatted')" {file}` },
    { glob: "**/*.bad", run: `node -e "process.exit(3)"` },
  ] }));
  const e = env(root);
  const file = writeFile(root, "notes/a.txt", "");
  const ok = runHook("format-dispatch.mjs", { tool_name: "Write", tool_input: { file_path: file } }, { env: e });
  assert.equal(ok.stdout, "");
  assert.equal(readFileSync(file, "utf8"), "formatted");

  const bad = runHook("format-dispatch.mjs", { tool_name: "Write", tool_input: { file_path: writeFile(root, "x.bad", "") } }, { env: e });
  assert.match(bad.json.hookSpecificOutput.additionalContext, /formatter failed/);
  assert.ok(existsSync(file));
  git(root, "status");
});
