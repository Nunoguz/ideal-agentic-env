// The hook is spawned exactly as Claude Code runs it: JSON on stdin, JSON on stdout.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "..", "inventory-check.mjs");

function project(files = {}) {
  const root = mkdtempSync(join(tmpdir(), "iae-gov-"));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  return root;
}

function run(root, input, data = mkdtempSync(join(tmpdir(), "iae-gov-data-"))) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, CLAUDE_PLUGIN_DATA: data },
  });
  return { ...r, context: r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.additionalContext : null };
}

const write = (root, rel, content, session = "s1") => ({ session_id: session, tool_name: "Write", tool_input: { file_path: join(root, rel), content } });

test("reminds once when a migration adds personal data, naming the fields", () => {
  const root = project({ "docs/compliance/data-inventory.md": "# inv\n" });
  const data = mkdtempSync(join(tmpdir(), "iae-gov-data-"));
  const input = write(root, "db/migrations/0003_users.sql", "ALTER TABLE users ADD COLUMN email text, ADD COLUMN birth_date date;");
  const first = run(root, input, data);
  assert.equal(first.status, 0);
  assert.match(first.context, /^\[governance:inventory-check\] db\/migrations\/0003_users\.sql/);
  assert.match(first.context, /birth date \(identity\), email \(contact\)/);
  assert.match(first.context, /data-inventory skill/);
  assert.doesNotMatch(first.context, /does not exist/);
  assert.equal(run(root, input, data).stdout, "", "same file and fields: no repeat");
});

test("special-category data mentions the DPIA, a missing inventory mentions setup", () => {
  const root = project();
  const r = run(root, { session_id: "s1", tool_name: "Edit", tool_input: { file_path: join(root, "prisma/schema.prisma"), old_string: "x", new_string: "bloodType String" } });
  assert.match(r.context, /Special-category data .*health/);
  assert.match(r.context, /dpia skill/);
  assert.match(r.context, /does not exist yet/);
});

test("stays quiet for non-schema files, schema files without personal data, and files outside the project", () => {
  const root = project();
  assert.equal(run(root, write(root, "src/mailer.ts", "sendEmail(user.email)")).stdout, "");
  assert.equal(run(root, write(root, "db/migrations/0004_idx.sql", "CREATE INDEX idx_orders_created ON orders(created_at);")).stdout, "");
  assert.equal(run(root, write(root, "../elsewhere/migrations/1.sql", "email text")).stdout, "");
});

test("an inventory edit earlier in the session changes the advice", () => {
  const root = project({ "docs/compliance/data-inventory.md": "# inv\n" });
  const data = mkdtempSync(join(tmpdir(), "iae-gov-data-"));
  run(root, write(root, "docs/compliance/data-inventory.md", "# inv\n| users.phone |"), data);
  assert.match(run(root, write(root, "db/migrations/0005.sql", "phone text"), data).context, /already edited in this session/);
});

test("fails open: malformed input produces no decision and exit 0", () => {
  const r = run(project(), "{not json");
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /\[governance:inventory-check\] skipped after error/);
});
