import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPlan, detectSource } from "./setup.mjs";
import { apply } from "./scaffold-lib.mjs";

const SETUP = join(dirname(fileURLToPath(import.meta.url)), "setup.mjs");
const LABELS = join(dirname(fileURLToPath(import.meta.url)), "..", "labels.json");
const dir = () => mkdtempSync(join(tmpdir(), "iae-work-"));

test("creates the issue form and PBI folder, and adds the work source to existing config", () => {
  const root = dir();
  mkdirSync(join(root, ".claude"));
  writeFileSync(join(root, ".claude/ideal-agentic-env.json"), JSON.stringify({ verify: { fast: [] } }));
  const plan = buildPlan(root, { source: "github" });
  apply(plan.root, plan.actions);
  assert.ok(existsSync(join(root, ".github/ISSUE_TEMPLATE/work-item.yml")));
  assert.ok(existsSync(join(root, "docs/pbi/README.md")));
  const cfg = JSON.parse(readFileSync(join(root, ".claude/ideal-agentic-env.json"), "utf8"));
  assert.deepEqual(cfg, { verify: { fast: [] }, work: { source: "github" } }, "existing keys untouched");
  assert.ok(buildPlan(root, { source: "pbi" }).actions.every((a) => a.action === "skip"), "an existing work source is never changed");
});

test("source detection: GitHub remote means github, anything else pbi; bad values are rejected", () => {
  const root = dir();
  assert.equal(detectSource(root), "pbi");
  spawnSync("git", ["init", "-q"], { cwd: root });
  spawnSync("git", ["remote", "add", "origin", "git@github.com:acme/app.git"], { cwd: root });
  assert.equal(detectSource(root), "github");
  assert.throws(() => buildPlan(root, { source: "jira" }), /--source must be one of/);
});

test("labels are well-formed and cover every type, status and priority the skills use", () => {
  const labels = JSON.parse(readFileSync(LABELS, "utf8"));
  const names = labels.map((l) => l.name);
  for (const n of ["type:feature", "type:bug", "type:chore", "type:spike", "status:needs-triage", "status:ready", "status:in-progress", "priority:p1", "compliance"]) assert.ok(names.includes(n), n);
  for (const l of labels) assert.match(l.color, /^[0-9a-f]{6}$/);
  assert.equal(new Set(names).size, names.length);
});

test("CLI dry run writes nothing", () => {
  const root = dir();
  const r = spawnSync(process.execPath, [SETUP, "--target", root, "--dry-run", "--json", "--source", "pbi"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).source, "pbi");
  assert.ok(!existsSync(join(root, "docs")));
});
