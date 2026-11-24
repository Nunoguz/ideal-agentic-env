// devops-selfhosted: the contract through the shared setup, and the container-scan script it installs (rendered
// exactly as setup renders it, then imported).
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
function project(files) {
  const root = mkdtempSync(join(tmpdir(), "iae-devops-"));
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: root });
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), typeof content === "string" ? content : JSON.stringify(content, null, 2));
  }
  return root;
}
const CONFIG = { ".claude/ideal-agentic-env.json": { verify: { fast: [], full: [] } }, ".github/dependabot.yml": "version: 2\nupdates:\n  - package-ecosystem: github-actions\n    directory: /\n" };

const plan = buildStackPlan(PLUGIN_ROOT, plugin, contract, project({ "apps/api/Dockerfile": "FROM x\n", ...CONFIG }));
const OUT = join(mkdtempSync(join(tmpdir(), "iae-cscan-")), "container-scan.mjs");
writeFileSync(OUT, plan.actions.find((a) => a.rel === ".github/scripts/container-scan.mjs").content);
const cs = await import(pathToFileURL(OUT).href);

test("setup: docker, compose and kubernetes rules, guarded deploy commands, the docker Dependabot entry and the workflow", () => {
  const root = project({ "apps/api/Dockerfile": "FROM x\n", "compose.yaml": "services: {}\n", "charts/api/Chart.yaml": "name: api\n", ...CONFIG });
  const p = buildStackPlan(PLUGIN_ROOT, plugin, contract, root);
  assert.deepEqual(p.profiles, ["docker", "compose", "kubernetes"]);
  const cfg = JSON.parse(p.actions.find((a) => a.rel === ".claude/ideal-agentic-env.json").content);
  assert.ok(cfg.guardedCommands.some((g) => g.reason === "deploying with Helm" && g.decision === "ask"));
  for (const g of cfg.guardedCommands) assert.doesNotThrow(() => new RegExp(g.pattern, "i"), g.pattern);
  assert.match(p.actions.find((a) => a.rel === ".github/dependabot.yml").content, /package-ecosystem: docker\n {4}directory: "\/apps\/api"/);
  const wf = p.actions.find((a) => a.rel === ".github/workflows/container.yml").content;
  assert.match(wf, /^# Managed by devops-selfhosted/);
  assert.match(wf, /branches: \[main\]/);
  assert.ok(!p.notes.some((n) => /lockfile/.test(n)), "a Dockerfile is not a lockfile");
});

test("images: every Dockerfile from the repository root, or the configured list", () => {
  const root = project({ "Dockerfile": "FROM a\n", "apps/web/Dockerfile": "FROM b\n", "ops/worker.Dockerfile": "FROM c\n", "node_modules/x/Dockerfile": "FROM d\n" });
  assert.deepEqual(cs.images(root, ""), [
    { name: "web", dockerfile: "apps/web/Dockerfile", context: "." },
    { name: "app", dockerfile: "Dockerfile", context: "." },
    { name: "worker", dockerfile: "ops/worker.Dockerfile", context: "." },
  ]);
  assert.deepEqual(cs.images(root, JSON.stringify({ devops: { images: [{ name: "API", dockerfile: "apps/api/Dockerfile", context: "apps/api" }] } })), [{ name: "api", dockerfile: "apps/api/Dockerfile", context: "apps/api" }]);
  assert.throws(() => cs.images(root, JSON.stringify({ devops: { images: [{ name: "x" }] } })), /dockerfile path/);
});

// Shaped like Trivy 0.76.2 output (node:18.0.0-alpine and a root Dockerfile, 2026-11-23).
const IMAGE = {
  Metadata: { OS: { Family: "alpine", Name: "3.15.4", EOSL: true } },
  Results: [
    { Target: "node (alpine 3.15.4)", Class: "os-pkgs", Vulnerabilities: [
      { VulnerabilityID: "CVE-2022-4450", PkgName: "libcrypto1.1", InstalledVersion: "1.1.1n-r0", FixedVersion: "1.1.1t-r0", Status: "fixed", Severity: "HIGH" },
      { VulnerabilityID: "CVE-2026-1", PkgName: "busybox", InstalledVersion: "1.34", FixedVersion: "", Status: "affected", Severity: "CRITICAL" },
      { VulnerabilityID: "CVE-2026-2", PkgName: "zlib", InstalledVersion: "1.2", FixedVersion: "1.3", Status: "fixed", Severity: "MEDIUM" },
      { VulnerabilityID: "CVE-2026-3", PkgName: "musl", InstalledVersion: "1.2", FixedVersion: "1.2.5", Status: "fixed", Severity: "UNKNOWN" },
    ] },
    { Target: "/app/.env", Class: "secret", Secrets: [{ RuleID: "aws-access-key-id", StartLine: 1 }] },
  ],
};
const CONFIG_REPORT = { Results: [{ Target: "apps/api/Dockerfile", Class: "config", Misconfigurations: [
  { ID: "DS-0002", Severity: "HIGH", Status: "FAIL", Title: "Image user should not be 'root'" },
  { ID: "DS-0026", Severity: "LOW", Status: "FAIL", Title: "No HEALTHCHECK defined" },
  { ID: "DS-0001", Severity: "MEDIUM", Status: "PASS", Title: "':latest' tag used" },
] }] };

test("classify: fixed HIGH/CRITICAL, UNKNOWN with a fix, secrets and HIGH misconfigurations block; the rest is reported", () => {
  const img = cs.classify(IMAGE, "api");
  assert.deepEqual(img.blocking.map((f) => f.severity), ["HIGH", "UNKNOWN", "SECRET"]);
  assert.deepEqual(img.reported.map((f) => [f.severity, f.why]), [["EOL", "upgrade the base image"], ["CRITICAL", "no fix published yet"], ["MEDIUM", "below HIGH"]]);
  const conf = cs.classify(CONFIG_REPORT, "config");
  assert.deepEqual(conf.blocking.map((f) => f.finding.split(" ")[0]), ["DS-0002"]);
  assert.deepEqual(conf.reported.map((f) => f.finding.split(" ")[0]), ["DS-0026"]);
});

test("scanAll: config scan, build, image scan; a failed build or scanner fails closed", () => {
  const calls = [];
  const spawn = (cmd, args) => {
    calls.push(`${cmd} ${args.join(" ")}`);
    if (args[0] === "config") return { status: 0, stdout: JSON.stringify(CONFIG_REPORT) };
    if (cmd === "docker") return { status: 0 };
    return { status: 0, stdout: JSON.stringify(IMAGE) };
  };
  const r = cs.scanAll("/repo", { list: [{ name: "api", dockerfile: "apps/api/Dockerfile", context: "." }], spawn, tag: "abc" });
  assert.deepEqual(r.scanned, ["config", "api"]);
  assert.equal(r.blocking.length, 4);
  assert.ok(calls.some((c) => c === "docker build --pull -f apps/api/Dockerfile -t iae-scan/api:abc ."));
  assert.ok(calls.some((c) => c.startsWith("trivy image --format json --quiet --scanners vuln,secret iae-scan/api:abc")));
  const fail = (when) => (cmd, args) => (when(cmd, args) ? { status: 1, stderr: "boom" } : spawn(cmd, args));
  assert.throws(() => cs.scanAll("/r", { list: [{ name: "api", dockerfile: "D", context: "." }], spawn: fail((c) => c === "docker") }), /docker build of D failed/);
  assert.throws(() => cs.scanAll("/r", { list: [], spawn: fail((c, a) => a[0] === "config") }), /trivy config exited with 1/);
  assert.throws(() => cs.scanAll("/r", { list: [], spawn: () => ({ error: new Error("ENOENT") }) }), /could not run trivy/);
  assert.equal(cs.scanAll("/r", { list: [{ name: "api", dockerfile: "D", context: "." }], spawn, build: false, tag: "t" }).scanned.length, 2);
});

test("the summary and the report issue", async () => {
  const md = cs.renderSummary({ ...cs.classify(IMAGE, "api"), scanned: ["config", "api"] });
  assert.match(md, /### Blocking \(3\)/);
  assert.match(md, /\.trivyignore/);
  let open = [];
  const calls = [];
  const api = async (path, opts = {}) => {
    calls.push({ path, ...opts });
    if (path.includes("/issues?")) return open;
    return path.endsWith("/issues") ? { number: 9 } : {};
  };
  assert.deepEqual(await cs.upsertReportIssue(api, "a/b", [{}], "x"), { action: "created", number: 9 });
  open = [{ number: 9, title: cs.ISSUE_TITLE }];
  assert.deepEqual(await cs.upsertReportIssue(api, "a/b", [], "none"), { action: "closed", number: 9 });
});
