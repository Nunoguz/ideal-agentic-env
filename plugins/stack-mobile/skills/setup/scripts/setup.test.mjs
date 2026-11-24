// stack-mobile's contract through the shared setup (shared/stack-lib.mjs is tested in scripts/).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadPlugin, PLUGIN_ROOT } from "./setup.mjs";
import { buildStackPlan } from "./stack-lib.mjs";

const { plugin, contract } = loadPlugin();
function project(files) {
  const root = mkdtempSync(join(tmpdir(), "iae-mobile-"));
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: root });
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), typeof content === "string" ? content : JSON.stringify(content, null, 2));
  }
  return root;
}
const repo = (mobileDeps, rootScripts = {}) =>
  project({
    "package.json": { name: "mono", workspaces: ["apps/*"], scripts: rootScripts, devDependencies: { prettier: "3.6.2" } },
    "package-lock.json": "{}",
    "apps/mobile/package.json": { name: "@acme/mobile", dependencies: mobileDeps },
    "apps/web/package.json": { name: "@acme/web", dependencies: { vue: "3.5.45" } },
    ".claude/ideal-agentic-env.json": { verify: { fast: [], full: [] }, format: [] },
  });

test("react-native and expo apply to the mobile app only; the npm rule comes along", () => {
  const plan = buildStackPlan(PLUGIN_ROOT, plugin, contract, repo({ expo: "58.0.23", "react-native": "0.83.0", "expo-secure-store": "58.0.2" }));
  assert.deepEqual(plan.profiles, ["react-native (apps/mobile)", "expo (apps/mobile)", "npm"]);
  assert.ok(!/apps\/web/.test(plan.actions.find((a) => a.rel.endsWith("react-native.md")).content));
  assert.ok(!plan.notes.some((n) => /secure storage/.test(n)));
});

test("expo verify steps follow the root scripts; a missing secure store is a hint", () => {
  const plan = buildStackPlan(PLUGIN_ROOT, plugin, contract, repo({ expo: "58.0.23", "react-native": "0.83.0" }, { typecheck: "tsc -b", "expo:check": "x", "expo:export": "y" }));
  const cfg = JSON.parse(plan.actions.find((a) => a.rel === ".claude/ideal-agentic-env.json").content);
  assert.deepEqual(cfg.verify.fast.map((s) => s.name), ["typecheck"]);
  assert.deepEqual(cfg.verify.full.map((s) => s.run), ["npm run expo:check", "npm run expo:export"]);
  assert.ok(plan.notes.some((n) => /secure storage/.test(n)));
  assert.ok(plan.notes.some((n) => /no "lint" script/.test(n)));
});

test("a project without React Native changes nothing", () => {
  const plan = buildStackPlan(PLUGIN_ROOT, plugin, contract, project({ "package.json": { name: "site", dependencies: { next: "16.0.0" } } }));
  assert.deepEqual(plan.actions, []);
});
