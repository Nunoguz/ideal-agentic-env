// stack-web's contract applied by the shared stack library, and the bundle-budget script it installs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadPlugin, PLUGIN_ROOT } from "./setup.mjs";
import { buildStackPlan } from "./stack-lib.mjs";

const { plugin, contract } = loadPlugin();

function project(files) {
  const root = mkdtempSync(join(tmpdir(), "iae-web-"));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), typeof content === "string" || Buffer.isBuffer(content) ? content : JSON.stringify(content));
  }
  return root;
}

const monorepo = () =>
  project({
    "package.json": { name: "mono", workspaces: ["apps/*"], scripts: { build: "npm run build --workspaces", test: "node --test" } },
    "package-lock.json": "{}",
    "apps/web/package.json": { name: "web", dependencies: { next: "16.0.0", react: "19.2.0" } },
    "apps/api/package.json": { name: "api", dependencies: { fastify: "5.6.1" } },
    "apps/mobile/package.json": { name: "mobile", dependencies: { react: "19.1.0", "react-native": "0.82.0" } },
    ".claude/ideal-agentic-env.json": { verify: { fast: [], full: [{ name: "build", run: "npm run build" }] }, format: [] },
  });

const budgetScript = buildStackPlan(PLUGIN_ROOT, plugin, contract, monorepo()).actions.find((a) => a.rel === ".github/scripts/bundle-budget.mjs");
const BUDGET = join(mkdtempSync(join(tmpdir(), "iae-budget-")), "bundle-budget.mjs");
writeFileSync(BUDGET, budgetScript.content);
const bb = await import(pathToFileURL(BUDGET).href);

test("web, react and next apply to the Next package only; backend and React Native packages are excluded", () => {
  const plan = buildStackPlan(PLUGIN_ROOT, plugin, contract, monorepo());
  assert.deepEqual(plan.profiles, ["web (apps/web)", "react (apps/web)", "next (apps/web)", "npm"]);
  const next = plan.actions.find((a) => a.rel === ".claude/rules/stack-web/next.md").content;
  assert.match(next, /- "apps\/web\/\*\*\/\*\.tsx"/);
  assert.match(next, /- "apps\/web\/next\.config\.\*"/);
  assert.ok(!/apps\/(api|mobile)/.test(next));
});

test("the bundle budget is configured and runs after the existing build step", () => {
  const plan = buildStackPlan(PLUGIN_ROOT, plugin, contract, monorepo());
  const cfg = JSON.parse(plan.actions.find((a) => a.rel === ".claude/ideal-agentic-env.json").content);
  assert.deepEqual(cfg.verify.full.map((s) => s.name), ["build", "test", "bundle-budget"]);
  assert.deepEqual(cfg.web, { budget: { largestChunkKb: 200, totalJsKb: 600 } });
  assert.ok(plan.actions.some((a) => a.rel === ".github/scripts/bundle-budget.mjs" && a.action === "create"));
});

// Random bytes do not compress, so the gzip size is close to the raw size.
const chunk = (kb) => randomBytes(kb * 1024);

test("bundle-budget passes within budget and finds outputs in workspace packages", () => {
  const root = project({ "apps/web/.next/static/chunks/a.js": chunk(20), "apps/web/.next/static/chunks/app/page.js": chunk(10), "apps/web/.next/static/chunks/a.js.map": chunk(300) });
  assert.deepEqual(bb.findOutputs(root), ["apps/web/.next/static"]);
  const r = bb.run(root);
  assert.equal(r.code, 0, r.lines.join("\n"));
  assert.match(r.lines[0], /^ok {6}apps\/web\/\.next\/static: 2 JS file\(s\)/);
});

test("bundle-budget fails over budget, honors the configured budget and dirs, and fails without a build", () => {
  const root = project({
    "dist/assets/big.js": chunk(40),
    ".claude/ideal-agentic-env.json": { web: { budget: { largestChunkKb: 30, totalJsKb: 100 } } },
  });
  const over = bb.run(root);
  assert.equal(over.code, 1);
  assert.match(over.lines.join("\n"), /largest .* \(budget 30\)[\s\S]*Over budget/);
  assert.equal(bb.run(project({ "src/a.ts": "x" })).code, 1);
  const missing = project({ ".claude/ideal-agentic-env.json": { web: { budget: { dirs: ["apps/web/.next/static"] } } } });
  assert.match(bb.run(missing).lines[0], /configured in web\.budget\.dirs but missing/);
});

test("vue and nuxt profiles: rules for the Vue and Nuxt packages, and a hint when the TS plugin is missing", () => {
  const root = project({
    "package.json": { name: "mono", workspaces: ["apps/*"], devDependencies: { prettier: "3.6.2" } },
    "apps/spa/package.json": { name: "spa", dependencies: { vue: "3.5.45", "vue-router": "4" }, devDependencies: { "vue-tsc": "3.3.14" } },
    "apps/site/package.json": { name: "site", dependencies: { nuxt: "4.6.4", vue: "3.5.45" } },
    ".claude/ideal-agentic-env.json": { verify: { fast: [], full: [] }, format: [] },
  });
  const plan = buildStackPlan(PLUGIN_ROOT, plugin, contract, root);
  assert.deepEqual(plan.profiles, ["web (apps/site, apps/spa)", "vue (apps/site, apps/spa)", "nuxt (apps/site)", "npm"]);
  const vue = plan.actions.find((a) => a.rel === ".claude/rules/stack-web/vue.md").content;
  assert.match(vue, /- "apps\/spa\/\*\*\/\*\.vue"/);
  const nuxt = plan.actions.find((a) => a.rel === ".claude/rules/stack-web/nuxt.md").content;
  assert.ok(!/apps\/spa/.test(nuxt));
  assert.ok(plan.notes.some((n) => /@vue\/typescript-plugin/.test(n)));
  const cfg = JSON.parse(plan.actions.find((a) => a.rel === ".claude/ideal-agentic-env.json").content);
  assert.match(cfg.format[0].glob, /vue\}$/);
});
