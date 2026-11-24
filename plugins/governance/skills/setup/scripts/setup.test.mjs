import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_LICENSES, buildPlan, planPolicy } from "./setup.mjs";
import { apply, readMarker, withMarker } from "./scaffold-lib.mjs";

const SETUP = join(dirname(fileURLToPath(import.meta.url)), "setup.mjs");
const dir = () => mkdtempSync(join(tmpdir(), "iae-gov-setup-"));

test("scaffolds docs and CI, renders every placeholder, and is a no-op the second time", () => {
  const root = dir();
  writeFileSync(join(root, "README.md"), "# x\n");
  const plan = buildPlan(root, { defaultBranch: "trunk" });
  apply(plan.root, plan.actions);
  for (const rel of [
    "docs/compliance/data-inventory.md",
    "docs/compliance/control-map.md",
    "docs/security/threat-model.md",
    ".github/workflows/security.yml",
    ".github/workflows/compliance.yml",
    ".github/workflows/change-audit.yml",
    ".github/scripts/compliance-gate.mjs",
    ".github/scripts/change-audit.mjs",
    ".github/dependabot.yml",
  ])
    assert.ok(existsSync(join(root, rel)), rel);
  for (const a of plan.actions) assert.ok(!/\{\{[A-Z_]+\}\}/.test(a.content ?? ""), `unrendered placeholder in ${a.rel}`);
  assert.match(readFileSync(join(root, ".github/workflows/change-audit.yml"), "utf8"), /branches: \[trunk\]/);
  assert.match(readFileSync(join(root, ".github/scripts/compliance-gate.mjs"), "utf8"), /export function findPersonalData/);
  assert.ok(buildPlan(root, { defaultBranch: "trunk" }).actions.every((a) => a.action === "skip"), "second run skips everything");
});

test("existing files are never overwritten", () => {
  const root = dir();
  const mine = join(root, "docs/compliance/data-inventory.md");
  apply(root, [{ rel: "docs/compliance/data-inventory.md", action: "create", content: "# mine\n" }]);
  const plan = buildPlan(root, { defaultBranch: "main" });
  assert.equal(plan.actions.find((a) => a.rel === "docs/compliance/data-inventory.md").action, "skip");
  apply(plan.root, plan.actions);
  assert.equal(readFileSync(mine, "utf8"), "# mine\n");
});

test("--parts limits what is written; unknown parts and bad branches are rejected", () => {
  const ci = buildPlan(dir(), { parts: ["ci"], defaultBranch: "main" });
  assert.ok(ci.actions.every((a) => a.rel.startsWith(".github/") || a.rel === ".claude/ideal-agentic-env.json"));
  assert.ok(buildPlan(dir(), { parts: ["docs"], defaultBranch: "main" }).actions.every((a) => a.rel.startsWith("docs/")));
  assert.throws(() => buildPlan(dir(), { parts: ["infra"] }), /unknown part/);
  assert.throws(() => buildPlan(dir(), { defaultBranch: "main; rm -rf /" }), /invalid branch/);
});

test("CLI dry run writes nothing and reports JSON", () => {
  const root = dir();
  const r = spawnSync(process.execPath, [SETUP, "--target", root, "--dry-run", "--json", "--default-branch", "main"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.dryRun, true);
  assert.ok(out.actions.some((a) => a.rel === ".github/workflows/security.yml" && a.action === "create"));
  assert.ok(!existsSync(join(root, ".github")));
  assert.equal(spawnSync(process.execPath, [SETUP, "--bogus"], { encoding: "utf8" }).status, 1);
});

const GOV = { name: "governance", version: "9.9.9" };
const SCRIPT = ".github/scripts/change-audit.mjs";
const write = (root, rel, content) => apply(root, [{ rel, action: "create", content }]);
const actionFor = (plan, rel) => plan.actions.find((a) => a.rel === rel);

test("managed CI files carry a marker; docs and dependabot.yml stay project files", () => {
  const plan = buildPlan(dir(), { defaultBranch: "main", plugin: GOV });
  for (const rel of [SCRIPT, ".github/scripts/dependency-gate.mjs", ".github/workflows/security.yml"]) {
    const mark = readMarker(actionFor(plan, rel).content);
    assert.equal(mark?.plugin, "governance", rel);
    assert.equal(mark.edited, false, rel);
  }
  assert.match(actionFor(plan, SCRIPT).content, /^#!\/usr\/bin\/env node\n\/\/ Managed by governance 9\.9\.9/);
  assert.match(actionFor(plan, ".github/workflows/security.yml").content, /^# Managed by governance 9\.9\.9/);
  assert.equal(readMarker(actionFor(plan, ".github/dependabot.yml").content), null);
  assert.equal(readMarker(actionFor(plan, "docs/compliance/data-inventory.md").content), null);
});

test("--refresh updates an unedited managed file and leaves an edited one alone unless adopted", () => {
  const root = dir();
  const old = { name: "governance", version: "0.1.0" };
  write(root, SCRIPT, withMarker(SCRIPT, "#!/usr/bin/env node\n// old\n", old));
  assert.match(actionFor(buildPlan(root, { defaultBranch: "main", plugin: GOV }), SCRIPT).note, /outdated \(0\.1\.0\); run setup with --refresh/);
  const refreshed = actionFor(buildPlan(root, { defaultBranch: "main", plugin: GOV, refresh: true }), SCRIPT);
  assert.equal(refreshed.action, "update");
  assert.match(refreshed.note, /0\.1\.0 -> 9\.9\.9/);

  write(root, SCRIPT, `${withMarker(SCRIPT, "#!/usr/bin/env node\n// old\n", old)}// a local fix\n`);
  const edited = actionFor(buildPlan(root, { defaultBranch: "main", plugin: GOV, refresh: true }), SCRIPT);
  assert.equal(edited.action, "skip");
  assert.match(edited.note, /edited by hand since 0\.1\.0/);
  assert.equal(actionFor(buildPlan(root, { defaultBranch: "main", plugin: GOV, refresh: true, adopt: [SCRIPT] }), SCRIPT).action, "update");
});

test("an unmarked copy from an older release is replaced only with --adopt; an identical one just gains the marker", () => {
  const root = dir();
  write(root, SCRIPT, "#!/usr/bin/env node\n// governance 0.1.2 copy\n");
  const plain = actionFor(buildPlan(root, { defaultBranch: "main", plugin: GOV, refresh: true }), SCRIPT);
  assert.equal(plain.action, "skip");
  assert.match(plain.note, /without a managed marker/);
  assert.equal(actionFor(buildPlan(root, { defaultBranch: "main", plugin: GOV, refresh: true, adopt: [SCRIPT] }), SCRIPT).action, "update");

  const fresh = dir();
  const body = readMarker(actionFor(buildPlan(dir(), { defaultBranch: "main", plugin: GOV }), SCRIPT).content).body;
  write(fresh, SCRIPT, body.replace(/\n/g, "\r\n"));
  assert.match(actionFor(buildPlan(fresh, { defaultBranch: "main", plugin: GOV }), SCRIPT).note, /up to date \(unmarked/);
  assert.match(actionFor(buildPlan(fresh, { defaultBranch: "main", plugin: GOV, refresh: true }), SCRIPT).note, /adds the managed marker/);
});

test("dependency policy: added to the project config, moved from an older security.yml, never overwritten", () => {
  assert.match(planPolicy(dir()).note, /run \/core:init first/);
  const root = dir();
  write(root, ".claude/ideal-agentic-env.json", JSON.stringify({ verify: {} }));
  const fresh = planPolicy(root);
  assert.equal(fresh.action, "merge");
  assert.deepEqual(JSON.parse(fresh.content).governance, { licenses: { allow: DEFAULT_LICENSES }, vulnerabilities: { blockAtOrAbove: 7 } });

  write(root, ".github/workflows/security.yml", 'env:\n  LICENSE_ALLOWLIST: "MIT,ISC,LGPL-3.0-only"\n');
  const moved = planPolicy(root);
  assert.match(moved.note, /moved from security\.yml/);
  assert.deepEqual(JSON.parse(moved.content).governance.licenses.allow, ["MIT", "ISC", "LGPL-3.0-only"]);

  write(root, ".claude/ideal-agentic-env.json", JSON.stringify({ governance: { licenses: { allow: ["MIT"] }, vulnerabilities: { blockAtOrAbove: 9 }, other: 1 } }));
  assert.equal(planPolicy(root).action, "skip");
  write(root, ".claude/ideal-agentic-env.json", JSON.stringify({ governance: { licenses: { allow: ["MIT"] } } }));
  assert.deepEqual(JSON.parse(planPolicy(root).content).governance, { licenses: { allow: ["MIT"] }, vulnerabilities: { blockAtOrAbove: 7 } });
  write(root, ".claude/ideal-agentic-env.json", JSON.stringify({ governance: "off" }));
  assert.match(planPolicy(root).note, /not an object/);
});

test("CLI --print shows what setup would write and writes nothing", () => {
  const root = dir();
  write(root, SCRIPT, "#!/usr/bin/env node\n// mine\n");
  const r = spawnSync(process.execPath, [SETUP, "--target", root, "--print", SCRIPT, "--default-branch", "main"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Managed by governance/);
  assert.equal(readFileSync(join(root, SCRIPT), "utf8"), "#!/usr/bin/env node\n// mine\n");
  assert.equal(spawnSync(process.execPath, [SETUP, "--target", root, "--print", "nope.txt"], { encoding: "utf8" }).status, 1);
});
