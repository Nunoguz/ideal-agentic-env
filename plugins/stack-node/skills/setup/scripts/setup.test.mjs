// Tests for the shared stack contract library (shared/stack-lib.mjs) through stack-node's copy and contract.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { apply } from "./scaffold-lib.mjs";
import { loadPlugin, PLUGIN_ROOT } from "./setup.mjs";
import { buildStackPlan, expandBraces, joinGlobs } from "./stack-lib.mjs";

const SETUP = join(dirname(fileURLToPath(import.meta.url)), "setup.mjs");
const { plugin, contract } = loadPlugin();

function project(files) {
  const root = mkdtempSync(join(tmpdir(), "iae-stack-"));
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: root });
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), typeof content === "string" ? content : JSON.stringify(content, null, 2));
  }
  return root;
}

const CONFIG = { verify: { fast: [{ name: "lint", run: "npm run lint" }], full: [] }, format: [], migrations: [] };
const DEPENDABOT = 'version: 2\nupdates:\n  - package-ecosystem: github-actions\n    directory: /\n';

const monorepo = (extra = {}) =>
  project({
    "package.json": { name: "mono", workspaces: ["apps/*"], scripts: { typecheck: "tsc -b", lint: "eslint .", test: "node --test" }, devDependencies: { prettier: "3.6.2" } },
    "package-lock.json": "{}",
    "apps/api/package.json": { name: "api", dependencies: { fastify: "5.6.1" } },
    "apps/web/package.json": { name: "web", dependencies: { next: "16.0.0", react: "19.2.0" } },
    ".claude/ideal-agentic-env.json": CONFIG,
    ".github/dependabot.yml": DEPENDABOT,
    ...extra,
  });

test("expandBraces expands every group", () => {
  assert.deepEqual(expandBraces("a/**/*.{ts,js}"), ["a/**/*.ts", "a/**/*.js"]);
  assert.deepEqual(expandBraces("*{x,y}*.{a,b}").length, 4);
  assert.deepEqual(expandBraces("plain"), ["plain"]);
});

test("profiles are detected per package; frontend packages and the workspace root are excluded", () => {
  const plan = buildStackPlan(PLUGIN_ROOT, plugin, contract, monorepo());
  assert.deepEqual(plan.profiles, ["node (apps/api)", "fastify (apps/api)", "npm"]);
  const npmRule = plan.actions.find((a) => a.rel === ".claude/rules/stack-node/npm-dependencies.md");
  assert.match(npmRule.content, /- "\*\*\/package\.json"/);
  assert.match(npmRule.content, /approve-scripts/);
  const rule = plan.actions.find((a) => a.rel === ".claude/rules/stack-node/node.md");
  assert.match(rule.content, /^---\npaths:\n {2}- "apps\/api\/\*\*\/\*\.ts"\n/);
  assert.ok(!/apps\/web/.test(rule.content));
  assert.match(rule.content, /<!-- Managed by stack-node /);
});

test("config is merged append-only: format added, existing verify steps kept, scripts become steps", () => {
  const plan = buildStackPlan(PLUGIN_ROOT, plugin, contract, monorepo());
  const cfg = JSON.parse(plan.actions.find((a) => a.rel === ".claude/ideal-agentic-env.json").content);
  assert.deepEqual(cfg.verify.fast.map((s) => s.name), ["lint", "typecheck"]);
  assert.deepEqual(cfg.verify.full.map((s) => s.name), ["test"]);
  assert.equal(cfg.verify.full[0].run, "npm test");
  assert.equal(cfg.format.length, 1);
  assert.match(cfg.format[0].run, /prettier --write/);
});

test("dependabot gets one npm entry with the cooldown; a second run is a no-op", () => {
  const root = monorepo();
  const first = buildStackPlan(PLUGIN_ROOT, plugin, contract, root);
  const dep = first.actions.find((a) => a.rel === ".github/dependabot.yml");
  assert.equal(dep.action, "merge");
  assert.match(dep.content, /- package-ecosystem: npm\n {4}directory: "\/"\n[\s\S]*default-days: 14/);
  apply(first.root, first.actions);
  const second = buildStackPlan(PLUGIN_ROOT, plugin, contract, root);
  assert.deepEqual(second.actions.map((a) => a.action), second.actions.map(() => "skip"));
});

test("missing prerequisites are skipped with a note, never created by a stack plugin", () => {
  const root = project({ "package.json": { name: "svc", dependencies: { fastify: "5.6.1" } } });
  const plan = buildStackPlan(PLUGIN_ROOT, plugin, contract, root);
  const byRel = Object.fromEntries(plan.actions.map((a) => [a.rel, a]));
  assert.equal(byRel[".claude/ideal-agentic-env.json"].action, "skip");
  assert.match(byRel[".claude/ideal-agentic-env.json"].note, /core:init/);
  assert.match(byRel[".github/dependabot.yml"].note, /governance:setup/);
  assert.ok(plan.notes.some((n) => /no lockfile/.test(n)));
  assert.ok(plan.notes.some((n) => /no formatter/.test(n)));
});

test("managed rule files are refreshed only with --refresh; foreign files are never touched", () => {
  const root = monorepo();
  const first = buildStackPlan(PLUGIN_ROOT, plugin, contract, root);
  apply(first.root, first.actions);
  const rel = ".claude/rules/stack-node/node.md";
  writeFileSync(join(root, rel), readFileSync(join(root, rel), "utf8").replace("# Node.js", "# Old Node.js"));
  writeFileSync(join(root, ".claude/rules/stack-node/fastify.md"), "# my own rules\n");
  const plain = buildStackPlan(PLUGIN_ROOT, plugin, contract, root);
  assert.match(plain.actions.find((a) => a.rel === rel).note, /--refresh/);
  const refreshed = buildStackPlan(PLUGIN_ROOT, plugin, contract, root, { refresh: true });
  assert.equal(refreshed.actions.find((a) => a.rel === rel).action, "update");
  const foreign = refreshed.actions.find((a) => a.rel === ".claude/rules/stack-node/fastify.md");
  assert.equal(foreign.action, "skip");
  assert.match(foreign.note, /not managed/);
});

test("a single-package frontend project matches no profile and changes nothing", () => {
  const root = project({ "package.json": { name: "site", dependencies: { next: "16.0.0" } }, ".claude/ideal-agentic-env.json": CONFIG });
  const plan = buildStackPlan(PLUGIN_ROOT, plugin, contract, root);
  assert.deepEqual(plan.actions, []);
  assert.match(plan.notes[0], /no matching profile/);
});

test("the CLI reports profiles and notes and exits 0", () => {
  const r = spawnSync(process.execPath, [SETUP, "--target", monorepo(), "--dry-run"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /profiles: node \(apps\/api\), fastify \(apps\/api\)/);
  const bad = spawnSync(process.execPath, [SETUP, "--profiles", "nope", "--dry-run"], { encoding: "utf8", cwd: monorepo() });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /unknown profile/);
});

test("a formatter another plugin already runs is added only for the files it does not cover", () => {
  const run = "npx --no-install prettier --write --log-level warn {file}";
  const root = monorepo({
    ".claude/ideal-agentic-env.json": { ...CONFIG, format: [{ glob: "**/*.{ts,tsx,js,jsx,mjs,cjs,json,css,md}", run }] },
  });
  const plan = buildStackPlan(PLUGIN_ROOT, plugin, contract, root);
  const cfg = JSON.parse(plan.actions.find((a) => a.rel === ".claude/ideal-agentic-env.json").content);
  assert.deepEqual(cfg.format.map((f) => f.glob), ["**/*.{ts,tsx,js,jsx,mjs,cjs,json,css,md}", "**/*.{mts,cts}"]);
  assert.equal(joinGlobs(["**/*.css"]), "**/*.css");
  assert.equal(joinGlobs(["a/*.ts", "b/*.ts"]), "{a/*.ts,b/*.ts}");
});

test("a shared rule another npm plugin already installed is not installed twice", () => {
  const root = monorepo();
  const body = readFileSync(join(PLUGIN_ROOT, "rules", "npm-dependencies.md"), "utf8");
  mkdirSync(join(root, ".claude/rules/stack-web"), { recursive: true });
  writeFileSync(join(root, ".claude/rules/stack-web/npm-dependencies.md"), `---\npaths:\n  - "**/package.json"\n---\n<!-- Managed by stack-web 0.2.0 via /stack-web:setup. -->\n\n${body}`);
  const plan = buildStackPlan(PLUGIN_ROOT, plugin, contract, root);
  const a = plan.actions.find((x) => x.rel === ".claude/rules/stack-node/npm-dependencies.md");
  assert.equal(a.action, "skip");
  assert.match(a.note, /already installed by stack-web/);
});
