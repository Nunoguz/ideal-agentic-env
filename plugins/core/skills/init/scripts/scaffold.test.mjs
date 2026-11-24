import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { apply, buildPlan, detect, mergeSettings, settingsFor, verifySteps } from "./scaffold.mjs";

const SCAFFOLD = join(dirname(fileURLToPath(import.meta.url)), "scaffold.mjs");

function project(files) {
  const root = mkdtempSync(join(tmpdir(), "iae-init-"));
  for (const [rel, content] of Object.entries(files)) {
    const p = join(root, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, typeof content === "string" ? content : JSON.stringify(content));
  }
  return root;
}

test("detects a Next.js + Prisma web app", () => {
  const root = project({ "package.json": { name: "shop", dependencies: { next: "15", "@prisma/client": "6" } }, "prisma/migrations/0001/migration.sql": "" });
  assert.deepEqual(detect(root).stacks, ["data-sql", "design", "stack-web"]);
});

test("detects every package of a workspace monorepo, not only the root", () => {
  const root = project({
    "package.json": JSON.stringify({ name: "mono", workspaces: ["apps/*", "packages/*"], devDependencies: { typescript: "6.0.3" } }),
    "apps/web/package.json": JSON.stringify({ dependencies: { next: "16.4.5", react: "19.3.1" } }),
    "apps/api/package.json": JSON.stringify({ dependencies: { fastify: "5.12.8", "drizzle-orm": "0.45.4", pg: "8.23.1" } }),
    "packages/contracts/package.json": JSON.stringify({ dependencies: { zod: "4.6.7" } }),
  });
  assert.deepEqual(detect(root).stacks, ["data-sql", "design", "stack-node", "stack-web"]);
  const lib = project({ "package.json": JSON.stringify({ name: "lib", workspaces: ["packages/*"] }), "packages/a/package.json": JSON.stringify({ dependencies: { zod: "4.6.7" } }) });
  assert.deepEqual(detect(lib).stacks, ["stack-node"], "a JS project with no framework falls back to stack-node");
});

test("detects a .NET API with EF Core and Docker", () => {
  const root = project({
    "Shop.sln": "",
    "src/Api/Api.csproj": '<PackageReference Include="Microsoft.EntityFrameworkCore" />',
    Dockerfile: "FROM x",
  });
  assert.deepEqual(detect(root).stacks, ["data-sql", "devops-selfhosted", "stack-dotnet"]);
});

test("detects Spring, Python and Android distinctly", () => {
  assert.deepEqual(detect(project({ "pom.xml": "<artifactId>flyway-core</artifactId>" })).stacks, ["data-sql", "stack-java-spring"]);
  assert.deepEqual(detect(project({ "pyproject.toml": "[tool.ruff]\nsqlalchemy" })).stacks, ["data-sql"]);
  assert.deepEqual(detect(project({ "build.gradle": "plugins { id 'com.android.application' }" })).stacks, ["design", "stack-mobile"]);
});

test("verify steps follow the project's real scripts and package manager", () => {
  const root = project({ "package.json": { scripts: { lint: "eslint .", test: "vitest run", build: "next build" }, dependencies: { next: "15" } }, "pnpm-lock.yaml": "" });
  const { stacks, info } = detect(root);
  const { fast, full } = verifySteps(stacks, info);
  assert.deepEqual(fast.map((s) => s.run), ["pnpm lint"]);
  assert.deepEqual(full.map((s) => s.run), ["pnpm test", "pnpm build"]);
});

test("maven wrapper steps are platform-specific", () => {
  const { stacks, info } = detect(project({ "pom.xml": "<project/>" }));
  const { fast } = verifySteps(stacks, info);
  assert.deepEqual(fast[0].run, { posix: "./mvnw -B -ntp -q test-compile", win32: "mvnw.cmd -B -ntp -q test-compile" });
});

test("scaffold creates the full skeleton and never overwrites existing files", () => {
  const root = project({ "package.json": { name: "api", dependencies: { fastify: "5" } }, "CLAUDE.md": "# mine\n", ".gitignore": "node_modules/" });
  const plan = buildPlan(root, { owner: "@acme/platform" });
  apply(plan);

  assert.equal(readFileSync(join(root, "CLAUDE.md"), "utf8"), "# mine\n", "existing CLAUDE.md untouched");
  for (const rel of ["scripts/verify.mjs", ".githooks/pre-push", ".github/workflows/ci.yml", ".github/CODEOWNERS", "docs/adr/0000-template.md", "docs/plans/README.md", ".claude/ideal-agentic-env.json", ".claude/settings.json"])
    assert.ok(existsSync(join(root, rel)), rel);

  const settings = JSON.parse(readFileSync(join(root, ".claude/settings.json"), "utf8"));
  assert.equal(settings.enabledPlugins["core@ideal-agentic-env"], true);
  assert.equal(settings.enabledPlugins["stack-node@ideal-agentic-env"], true);
  assert.equal(settings.extraKnownMarketplaces["ideal-agentic-env"].source.repo, "Nunoguz/ideal-agentic-env");

  const gitignore = readFileSync(join(root, ".gitignore"), "utf8");
  assert.match(gitignore, /^node_modules\/\n# ideal-agentic-env\n\.claude\/settings\.local\.json\n\.claude\/audit\/\n$/);
  assert.match(readFileSync(join(root, ".github/CODEOWNERS"), "utf8"), /\.claude\/\s+@acme\/platform/);
  const ci = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
  assert.match(ci, /npm ci\n      # >>> ideal-agentic-env:steps .*\n      # <<< ideal-agentic-env:steps\n      - run: node scripts\/verify\.mjs --full\n/);
  assert.match(ci, /timeout-minutes: 30\n    # >>> ideal-agentic-env:services .*\n    # <<< ideal-agentic-env:services\n    steps:/);
  for (const ref of ci.match(/uses: \S+/g)) assert.match(ref, /@[0-9a-f]{40}$/, `${ref} is pinned to a commit SHA`);
  for (const a of plan.actions.filter((x) => x.content))
    assert.ok(!/\{\{[A-Z_]+\}\}/.test(a.content), `no unrendered placeholders in ${a.rel}`);

  const again = buildPlan(root, { owner: "@acme/platform" });
  assert.ok(again.actions.every((a) => a.action === "skip"), "second run is a no-op");
});

test("CODEOWNERS is skipped without an owner", () => {
  const plan = buildPlan(project({}), {});
  assert.equal(plan.actions.find((a) => a.rel === ".github/CODEOWNERS").action, "skip");
});

test("settings merge is add-only and preserves explicit choices", () => {
  const wanted = settingsFor(["core", "design"], "o/r");
  const merged = mergeSettings({ enabledPlugins: { "design@ideal-agentic-env": false }, permissions: { allow: ["Bash(npm test)"], deny: ["Read(./secrets/**)"] } }, wanted);
  assert.equal(merged.enabledPlugins["design@ideal-agentic-env"], false, "explicit false is kept");
  assert.equal(merged.enabledPlugins["core@ideal-agentic-env"], true);
  assert.deepEqual(merged.permissions.allow, ["Bash(npm test)"]);
  assert.ok(merged.permissions.deny.includes("Read(./secrets/**)") && merged.permissions.deny.includes("Read(./**/.env)"));
});

test("unknown stacks are rejected", () => {
  assert.throws(() => buildPlan(project({}), { stacks: ["stack-cobol"] }), /unknown plugin/);
});

test("generated verify.mjs runs configured steps and fails on a red step", () => {
  const root = project({});
  apply(buildPlan(root, { stacks: ["stack-node"] }));
  const cfgPath = join(root, ".claude/ideal-agentic-env.json");
  const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
  cfg.verify.fast = [{ name: "ok", run: 'node -e "process.exit(0)"' }];
  cfg.verify.full = [{ name: "red", run: { posix: 'node -e "process.exit(3)"', win32: 'node -e "process.exit(3)"' } }];
  writeFileSync(cfgPath, JSON.stringify(cfg));
  const verify = (mode) => spawnSync(process.execPath, [join(root, "scripts/verify.mjs"), mode], { encoding: "utf8" });
  assert.equal(verify("--fast").status, 0);
  const full = verify("--full");
  assert.equal(full.status, 1);
  assert.match(full.stdout, /✗ red/);
});

test("CLI dry run writes nothing and reports actions", () => {
  const root = project({ "package.json": { name: "x" } });
  const r = spawnSync(process.execPath, [SCAFFOLD, "--target", root, "--dry-run", "--json"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.dryRun, true);
  assert.ok(out.actions.some((a) => a.rel === "CLAUDE.md" && a.action === "create"));
  assert.ok(!existsSync(join(root, "CLAUDE.md")));
});

test("CLI rejects a malformed owner", () => {
  const r = spawnSync(process.execPath, [SCAFFOLD, "--target", project({}), "--owner", "not-a-handle", "--dry-run"], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--owner/);
});

test("generated pre-push hook blocks protected branches and lets feature branches through", () => {
  const root = project({});
  apply(buildPlan(root, { stacks: ["stack-node"] }));
  const hook = join(root, ".githooks", "pre-push");
  if (process.platform !== "win32") assert.ok(statSync(hook).mode & 0o111, "hook is executable");
  const sha = "a".repeat(40);
  const push = (remoteRef) =>
    spawnSync(process.execPath, [hook, "origin", "https://example.invalid/r.git"], { input: `refs/heads/x ${sha} ${remoteRef} ${"0".repeat(40)}\n`, encoding: "utf8" });
  const main = push("refs/heads/main");
  assert.equal(main.status, 1);
  assert.match(main.stderr, /protected branch main/);
  assert.equal(push("refs/heads/release/1.2").status, 1);
  assert.equal(push("refs/heads/feat/12-login").status, 0);
  assert.equal(push("refs/tags/v1.0.0").status, 0);
  assert.equal(spawnSync(process.execPath, [hook], { input: "", encoding: "utf8" }).status, 0, "nothing to push");
});
