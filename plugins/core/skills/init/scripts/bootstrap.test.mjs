// core:init v2 and core:plugins: one run detects, installs, scaffolds, runs every setup and verifies.
// Plugins resolve as siblings of core (this repository's plugins/ folder); the claude CLI is faked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { bootstrap, desiredPlugins, render } from "./bootstrap.mjs";

function project(files) {
  const root = mkdtempSync(join(tmpdir(), "iae-boot-"));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), typeof content === "string" ? content : JSON.stringify(content, null, 2));
  }
  const git = (...a) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...a], { cwd: root });
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("commit", "-q", "-m", "init", "--allow-empty");
  return root;
}

const NODE_API = { "package.json": { name: "api", scripts: { lint: "node -e 0" }, dependencies: { fastify: "5", pg: "8" } }, "package-lock.json": "{}" };

// Every test runs with its own Claude config, so the real registry is never read or written.
process.env.CLAUDE_CONFIG_DIR = mkdtempSync(join(tmpdir(), "iae-boot-config-"));
// The test projects are their own repositories: a CI run's pull-request context (base ref, event) does not apply.
for (const k of Object.keys(process.env)) if (/^GITHUB_(BASE_REF|HEAD_REF|EVENT_NAME|EVENT_PATH|REF|REF_NAME|SHA)$/.test(k)) delete process.env[k];

test("desired plugins: mandatory + enabled + detected + added - removed; mandatory cannot go", () => {
  const root = project({ ...NODE_API, ".claude/settings.json": { enabledPlugins: { "design@ideal-agentic-env": true, "other@elsewhere": true } } });
  assert.deepEqual(desiredPlugins(root, { detect: true }).plugins, ["core", "governance", "work-github", "stack-node", "data-sql", "design"]);
  assert.deepEqual(desiredPlugins(root, { add: ["devops-selfhosted"], remove: ["design"] }).plugins, ["core", "governance", "work-github", "devops-selfhosted"]);
  assert.throws(() => desiredPlugins(root, { remove: ["governance"] }), /cannot be removed/);
  assert.throws(() => desiredPlugins(root, { add: ["stack-cobol"] }), /unknown plugin/);
});

test("one run sets the project up: scaffold, every setup, verify --fast; a second run changes nothing", () => {
  const root = project(NODE_API);
  const dry = bootstrap(root, { detect: true, noInstall: true, dryRun: true, owner: "@team" });
  assert.equal(existsSync(join(root, ".claude", "ideal-agentic-env.json")), false, "a dry run writes nothing");
  assert.deepEqual(dry.setups.map((s) => s.status), ["will run", "will run", "will run", "will run"]);

  const r = bootstrap(root, { detect: true, noInstall: true, owner: "@team" });
  assert.deepEqual(r.plugins, ["core", "governance", "work-github", "stack-node", "data-sql"]);
  assert.deepEqual(r.setups.map((s) => [s.plugin, s.status]), [["governance", "ok"], ["work-github", "ok"], ["stack-node", "ok"], ["data-sql", "ok"]]);
  assert.ok(existsSync(join(root, ".claude", "rules", "stack-node")) && existsSync(join(root, ".github", "workflows", "security.yml")));
  const settings = JSON.parse(readFileSync(join(root, ".claude", "settings.json"), "utf8"));
  assert.ok(settings.enabledPlugins["stack-node@ideal-agentic-env"] && settings.enabledPlugins["data-sql@ideal-agentic-env"]);
  assert.ok(r.verify.ok && !r.verify.empty, r.verify.tail);
  assert.ok(r.manual.some((m) => m === "claude plugin install stack-node@ideal-agentic-env --scope project"), "--no-install prints the commands");

  const again = bootstrap(root, { noInstall: true });
  assert.deepEqual(again.scaffold, []);
  assert.deepEqual(again.setups.flatMap((s) => s.changed), [], "idempotent");
  assert.match(render(r), /verify --fast: green/);
});

test("removing a plugin takes back its rules, CI blocks, verify steps and unedited managed files", () => {
  const root = project(NODE_API);
  bootstrap(root, { detect: true, noInstall: true });
  const script = join(root, ".github", "scripts", "migration-check.mjs");
  assert.ok(existsSync(script));
  const r = bootstrap(root, { remove: ["data-sql"], noInstall: true });
  assert.deepEqual(r.removed, ["data-sql"]);
  assert.equal(existsSync(join(root, ".claude", "rules", "data-sql")), false);
  assert.equal(existsSync(script), false, "an unedited managed script is removed");
  const cfg = JSON.parse(readFileSync(join(root, ".claude", "ideal-agentic-env.json"), "utf8"));
  assert.ok(!cfg.verify.fast.some((s) => s.name === "migrations"));
  const settings = JSON.parse(readFileSync(join(root, ".claude", "settings.json"), "utf8"));
  assert.equal(settings.enabledPlugins["data-sql@ideal-agentic-env"], undefined);
  assert.ok(!r.plugins.includes("data-sql"));
});

test("an edited managed file is kept and reported", () => {
  const root = project(NODE_API);
  bootstrap(root, { detect: true, noInstall: true });
  const script = join(root, ".github", "scripts", "migration-check.mjs");
  writeFileSync(script, `${readFileSync(script, "utf8")}\n// local change\n`);
  const r = bootstrap(root, { remove: ["data-sql"], noInstall: true });
  assert.ok(existsSync(script));
  assert.ok(r.kept.some((k) => /migration-check\.mjs \(edited by hand\)/.test(k)));
});

test("install: the claude CLI is called at project scope for each missing plugin", { skip: process.platform === "win32" }, () => {
  const root = project(NODE_API);
  const log = join(root, "..", `claude-calls-${Date.now()}.log`);
  const bin = join(mkdtempSync(join(tmpdir(), "iae-boot-bin-")), "claude");
  writeFileSync(bin, `#!/bin/sh\necho "$@" >> "${log}"\n`);
  chmodSync(bin, 0o755);
  process.env.CLAUDE_BIN = bin;
  try {
    const r = bootstrap(root, { add: ["stack-node"] });
    assert.deepEqual(r.installed, ["governance", "work-github", "stack-node"]);
    assert.deepEqual(readFileSync(log, "utf8").trim().split("\n"), [
      "plugin install governance@ideal-agentic-env --scope project",
      "plugin install work-github@ideal-agentic-env --scope project",
      "plugin install stack-node@ideal-agentic-env --scope project",
    ]);
    const removed = bootstrap(root, { remove: ["stack-node"] });
    assert.deepEqual(removed.removed, ["stack-node"]);
  } finally {
    delete process.env.CLAUDE_BIN;
  }
});
