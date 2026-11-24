// The token-lint script design:setup installs, rendered as setup renders it, and design's contract.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadPlugin, PLUGIN_ROOT } from "./setup.mjs";
import { buildStackPlan } from "./stack-lib.mjs";

const { plugin, contract } = loadPlugin();

function put(root, rel, content) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), typeof content === "string" ? content : JSON.stringify(content));
}
const GIT_ID = ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false"];
function git(cwd, ...args) {
  const r = spawnSync("git", [...GIT_ID, ...args], { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
}
function repo(files) {
  const root = mkdtempSync(join(tmpdir(), "iae-token-"));
  git(root, "init", "-q", "-b", "main");
  for (const [rel, content] of Object.entries(files)) put(root, rel, content);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "base");
  git(root, "switch", "-q", "-c", "feat/ui");
  return root;
}

const uiProject = mkdtempSync(join(tmpdir(), "iae-design-"));
put(uiProject, "package.json", { dependencies: { next: "16.0.0", react: "19.2.0" } });
put(uiProject, ".claude/ideal-agentic-env.json", { verify: { fast: [], full: [] } });
const plan = buildStackPlan(PLUGIN_ROOT, plugin, contract, uiProject);
const LINT = join(mkdtempSync(join(tmpdir(), "iae-token-lint-")), "token-lint.mjs");
writeFileSync(LINT, plan.actions.find((a) => a.rel === ".github/scripts/token-lint.mjs").content);
const tl = await import(pathToFileURL(LINT).href);
const LOCAL = { GITHUB_ACTIONS: "", GITHUB_BASE_REF: "" };

test("design setup adds the ui rule, the token-lint step and the design settings", () => {
  assert.deepEqual(plan.profiles, ["ui"]);
  const cfg = JSON.parse(plan.actions.find((a) => a.rel === ".claude/ideal-agentic-env.json").content);
  assert.deepEqual(cfg.verify.fast, [{ name: "token-lint", run: "node .github/scripts/token-lint.mjs" }]);
  assert.deepEqual(cfg.design.tokenFiles, tl.DEFAULTS.tokenFiles);
  assert.ok(plan.actions.some((a) => a.rel === ".claude/rules/design/ui.md"));
});

const rules = (line) => tl.lintLine(line).map((f) => `${f.rule}:${f.value}`);

test("lintLine: literal colors and lengths are found; tokens, hairlines and queries are not", () => {
  assert.deepEqual(rules("  color: #1a2b3c;"), ["literal-color:#1a2b3c"]);
  assert.deepEqual(rules('<div className="bg-[#fff] p-[13px]">'), ["literal-color:#fff", "literal-length:13px"]);
  assert.deepEqual(rules("  background: rgb(0 0 0 / 0.5);"), ["literal-color:rgb("]);
  assert.deepEqual(rules("  border: 1px solid oklch(70% 0.1 200);"), ["literal-color:oklch("]);
  assert.deepEqual(rules("  padding: 16px 1.5rem;"), ["literal-length:16px", "literal-length:1.5rem"]);
  assert.deepEqual(rules("  padding: var(--space-4); border: var(--border-width) solid var(--color-border);"), []);
  assert.deepEqual(rules("  border-bottom: 1px solid var(--color-border); margin: 0;"), []);
  assert.deepEqual(rules("@media (min-width: 768px) {"), []);
  assert.deepEqual(rules("// spacing used to be 16px"), []);
  assert.deepEqual(rules('<a href="#main">Skip</a> &#123;'), []);
  assert.deepEqual(rules("const columns = 12; const ratio = 1.5;"), []);
});

test("only added lines are checked; token files, tests and annotated lines are exempt", () => {
  const root = repo({
    "src/Card.tsx": 'export const Card = () => <div style={{ color: "#123456" }} />;\n',
    "src/styles/tokens.css": ":root { --color-text: #111111; }\n",
  });
  put(root, "src/Card.tsx", 'export const Card = () => <div style={{ color: "#123456" }} />;\nexport const Box = () => <div style={{ padding: "12px" }} />;\n');
  put(root, "src/styles/tokens.css", ":root { --color-text: #111111; --space-3: 12px; }\n");
  put(root, "src/Card.test.tsx", 'expect(style.color).toBe("#123456");\n');
  put(root, "src/New.css", ".a { color: #abcdef; }\n/* token-lint: allow brand logo color from the partner's guideline */\n.logo { color: #ff6600; }\n");
  const r = tl.run(root, { env: LOCAL });
  assert.equal(r.code, 1);
  const errors = r.lines.filter((l) => l.startsWith("error"));
  assert.deepEqual(errors.map((l) => l.split(" ")[3]), ["src/Card.tsx:2:", "src/New.css:1:"].map((s) => s), errors.join("\n"));
});

test("a clean change passes; --all reports existing literals; CI pushes are skipped", () => {
  const root = repo({ "src/Old.tsx": 'export const Old = () => <p style={{ margin: "8px" }} />;\n' });
  put(root, "src/New.tsx", 'export const New = () => <p className="text-muted" />;\n');
  assert.equal(tl.run(root, { env: LOCAL }).code, 0);
  assert.equal(tl.run(root, { all: true }).code, 1);
  assert.match(tl.run(root, { env: { GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "push" } }).lines[0], /skipped/);
});
