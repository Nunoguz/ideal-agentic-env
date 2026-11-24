// stack-dotnet's contract through the shared setup (shared/stack-lib.mjs is tested in scripts/).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { apply } from "./scaffold-lib.mjs";
import { loadPlugin, PLUGIN_ROOT } from "./setup.mjs";
import { buildStackPlan } from "./stack-lib.mjs";

const { plugin, contract } = loadPlugin();
const CORE_CI = readFileSync(join(PLUGIN_ROOT, "..", "core", "skills", "init", "templates", ".github", "workflows", "ci.yml.tmpl"), "utf8").replace("{{STACK_SETUP}}\n", "");

function project(files) {
  const root = mkdtempSync(join(tmpdir(), "iae-dotnet-"));
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: root });
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), typeof content === "string" ? content : JSON.stringify(content, null, 2));
  }
  return root;
}

const API = '<Project Sdk="Microsoft.NET.Sdk.Web"><ItemGroup><PackageReference Include="Microsoft.AspNetCore.OpenApi" /></ItemGroup></Project>';
const TESTS = '<Project Sdk="Microsoft.NET.Sdk"><ItemGroup><PackageReference Include="xunit.v3" /><PackageReference Include="Microsoft.AspNetCore.Mvc.Testing" /></ItemGroup></Project>';
const BASE = {
  "Lending.slnx": "<Solution />",
  "src/Lending.Api/Lending.Api.csproj": API,
  "tests/Lending.Api.Tests/Lending.Api.Tests.csproj": TESTS,
  ".claude/ideal-agentic-env.json": { verify: { fast: [], full: [] }, format: [] },
  ".github/dependabot.yml": "version: 2\nupdates:\n  - package-ecosystem: github-actions\n    directory: /\n",
  ".github/workflows/ci.yml": CORE_CI,
};

test("profiles: dotnet for every C# file, aspnetcore for the web project, test for the test project", () => {
  const plan = buildStackPlan(PLUGIN_ROOT, plugin, contract, project(BASE));
  assert.deepEqual(plan.profiles, ["dotnet", "aspnetcore (src/Lending.Api)", "test (tests/Lending.Api.Tests)"]);
  assert.match(plan.actions.find((a) => a.rel.endsWith("aspnetcore.md")).content, /- "src\/Lending\.Api\/\*\*\/\*\.cs"/);
  assert.match(plan.actions.find((a) => a.rel.endsWith("testing.md")).content, /- "tests\/Lending\.Api\.Tests\/\*\*\/\*\.cs"/);
});

test("config: solution-based verify steps and the whitespace formatter; Directory.Build.props and Dependabot", () => {
  const plan = buildStackPlan(PLUGIN_ROOT, plugin, contract, project(BASE));
  const cfg = JSON.parse(plan.actions.find((a) => a.rel === ".claude/ideal-agentic-env.json").content);
  assert.deepEqual(cfg.verify.fast.map((s) => s.run), ['dotnet build "Lending.slnx" --nologo', 'dotnet format "Lending.slnx" --verify-no-changes --no-restore']);
  assert.deepEqual(cfg.verify.full.map((s) => s.run), ['dotnet test "Lending.slnx" --nologo']);
  assert.deepEqual(cfg.format, [{ glob: "**/*.cs", run: "dotnet format whitespace --folder --include {file}" }]);
  const props = plan.actions.find((a) => a.rel === "Directory.Build.props");
  assert.equal(props.action, "create");
  assert.match(props.content, /<TreatWarningsAsErrors>true<\/TreatWarningsAsErrors>/);
  assert.match(props.content, /<RestorePackagesWithLockFile>true/);
  assert.match(plan.actions.find((a) => a.rel === ".github/dependabot.yml").content, /package-ecosystem: nuget/);
  assert.ok(plan.notes.some((n) => /no lockfile \(packages\.lock\.json\)/.test(n)));
});

test("ci: setup-dotnet from global.json when present, the 10.0 band otherwise; never twice", () => {
  const plain = buildStackPlan(PLUGIN_ROOT, plugin, contract, project(BASE)).actions.find((a) => a.rel === ".github/workflows/ci.yml");
  assert.match(plain.content, /# --- stack-dotnet \d+\.\d+\.\d+\n[\s\S]*dotnet-version: "10\.0\.x"/);
  const root = project({ ...BASE, "global.json": '{ "sdk": { "version": "10.0.302", "rollForward": "latestFeature" } }' });
  const pinned = buildStackPlan(PLUGIN_ROOT, plugin, contract, root);
  const ci = pinned.actions.find((a) => a.rel === ".github/workflows/ci.yml");
  assert.match(ci.content, /global-json-file: global\.json/);
  assert.ok(!/dotnet-version/.test(ci.content));
  apply(root, pinned.actions);
  assert.deepEqual(buildStackPlan(PLUGIN_ROOT, plugin, contract, root).actions.filter((a) => a.action !== "skip").map((a) => a.rel), [], "a second run changes nothing");
});

test("a CSharpier tool manifest switches the formatter; no solution file leaves the verify steps out with a note", () => {
  const files = { ...BASE, ".config/dotnet-tools.json": '{ "version": 1, "tools": { "csharpier": { "version": "1.3.0", "commands": ["csharpier"] } } }' };
  delete files["Lending.slnx"];
  const plan = buildStackPlan(PLUGIN_ROOT, plugin, contract, project(files));
  const cfg = JSON.parse(plan.actions.find((a) => a.rel === ".claude/ideal-agentic-env.json").content);
  assert.deepEqual(cfg.format.map((f) => f.run), ["dotnet csharpier format {file}"]);
  assert.deepEqual(cfg.verify.fast, []);
  assert.ok(plan.notes.some((n) => /no solution file/.test(n)));
});
