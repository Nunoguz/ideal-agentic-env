import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scan } from "./scan-pii.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "scan-pii.mjs");

function project(files) {
  const root = mkdtempSync(join(tmpdir(), "iae-scan-"));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  return root;
}

test("finds personal data in schema files only, with line numbers", () => {
  const root = project({
    "db/migrations/0001.sql": "create table users (\n  id uuid,\n  email text,\n  blood_type text\n);\n",
    "src/mailer.ts": "send(user.email)\n",
    "node_modules/x/migrations/1.sql": "email text\n",
  });
  const { hits, files } = scan(root);
  assert.equal(files, 1);
  assert.deepEqual(hits.map((h) => [h.file, h.line, h.found.map((f) => f.label)]), [
    ["db/migrations/0001.sql", 3, ["email"]],
    ["db/migrations/0001.sql", 4, ["health"]],
  ]);
});

test("CLI prints a readable list", () => {
  const root = project({ "prisma/schema.prisma": "model User {\n  phone String\n}\n" });
  const r = spawnSync(process.execPath, [SCRIPT, "--root", root], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /prisma\/schema\.prisma:2 {2}phone \(contact\)/);
  assert.match(r.stdout, /1 line\(s\) in 1 schema file\(s\)/);
});
