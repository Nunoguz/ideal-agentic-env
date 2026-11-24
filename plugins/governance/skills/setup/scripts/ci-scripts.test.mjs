// Tests for the CI scripts governance:setup installs under .github/scripts/. They are rendered exactly
// as setup renders them, written to a temp .mjs and imported, so the shipped template is what is tested.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildPlan } from "./setup.mjs";

const OUT = mkdtempSync(join(tmpdir(), "iae-gov-ci-"));
const rendered = Object.fromEntries(
  buildPlan(mkdtempSync(join(tmpdir(), "iae-gov-empty-")), { parts: ["ci"], defaultBranch: "main" })
    .actions.filter((a) => a.rel.startsWith(".github/scripts/"))
    .map((a) => {
      const file = join(OUT, a.rel.split("/").pop());
      writeFileSync(file, a.content);
      return [a.rel.split("/").pop(), file];
    }),
);
const gate = await import(pathToFileURL(rendered["compliance-gate.mjs"]).href);
const audit = await import(pathToFileURL(rendered["change-audit.mjs"]).href);
const depgate = await import(pathToFileURL(rendered["dependency-gate.mjs"]).href);

// ---------- compliance gate ----------

const GIT_ID = ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false"];
function git(cwd, ...args) {
  const r = spawnSync("git", [...GIT_ID, ...args], { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
}
function put(root, rel, content) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), content);
}
function repoWithBranch(files) {
  const root = mkdtempSync(join(tmpdir(), "iae-gate-"));
  git(root, "init", "-q", "-b", "main");
  put(root, "README.md", "# t\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "init");
  git(root, "switch", "-q", "-c", "feat/1");
  for (const [rel, content] of Object.entries(files)) put(root, rel, content);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "change");
  return root;
}
const runGate = (root, ...args) => spawnSync(process.execPath, [rendered["compliance-gate.mjs"], "--base", "main", "--head", "HEAD", ...args], { cwd: root, encoding: "utf8" });

test("gate: parseDiff returns added lines with their new line numbers", () => {
  const diff = ["diff --git a/x.sql b/x.sql", "--- a/x.sql", "+++ b/x.sql", "@@ -1,0 +2,2 @@", "+email text,", "+phone text", "+++ /dev/null"].join("\n");
  assert.deepEqual([...gate.parseDiff(diff)], [["x.sql", [{ line: 2, text: "email text," }, { line: 3, text: "phone text" }]]]);
});

test("gate: attestation is a ticked inventory checkbox or an explicit line", () => {
  assert.ok(gate.attested("- [x] No new personal data ... or the data inventory is updated"));
  assert.ok(gate.attested("* [X] Veri envanteri güncel"));
  assert.ok(gate.attested("Inventory: not needed — only an index on email"));
  assert.ok(!gate.attested("- [ ] No new personal data ... or the data inventory is updated"));
  assert.ok(!gate.attested(null));
});

test("gate: fails on personal data without an inventory change, passes with one", () => {
  const red = repoWithBranch({ "db/migrations/0002_users.sql": "ALTER TABLE users ADD COLUMN email text;\n" });
  const r = runGate(red);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /❌ fail/);
  assert.match(r.stdout, /`db\/migrations\/0002_users\.sql:1` email \(contact\)/);
  assert.match(r.stdout, /::error file=db\/migrations\/0002_users\.sql,line=1::/);

  const green = repoWithBranch({ "db/migrations/0002_users.sql": "ALTER TABLE users ADD COLUMN email text;\n", "docs/compliance/data-inventory.md": "| users.email | contact |\n" });
  const ok = runGate(green);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /Data inventory updated \| yes/);
});

test("gate: an attestation in the PR body passes, and unrelated changes always pass", () => {
  const root = repoWithBranch({ "db/migrations/0002_idx.sql": "CREATE INDEX idx_users_email ON users(email);\n" });
  const body = join(root, "..", `body-${Date.now()}.md`);
  writeFileSync(body, "## Compliance impact\n\n- [x] No new personal data, external processor or retention change — or the data inventory is updated\n");
  assert.equal(runGate(root, "--body-file", body).status, 0);
  assert.equal(runGate(repoWithBranch({ "src/mailer.ts": "send(user.email)\n" })).status, 0, "non-schema files are not gated");
});

test("gate: honours project schema paths and terms from .claude/ideal-agentic-env.json", () => {
  const root = repoWithBranch({
    ".claude/ideal-agentic-env.json": JSON.stringify({ governance: { schemaPaths: ["contracts/**"], piiTerms: ["customer number"] } }),
    "contracts/customer.yaml": "customerNumber: string\n",
  });
  assert.equal(runGate(root).status, 1);
});

test("gate: exits 2 with a clear message outside a pull_request event", () => {
  const r = spawnSync(process.execPath, [rendered["compliance-gate.mjs"]], { cwd: OUT, encoding: "utf8", env: { ...process.env, GITHUB_EVENT_PATH: "" } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /not a pull_request event/);
});

// ---------- change audit ----------

const REPO = "acme/app";
const pr = (n, head, extra = {}) => ({ number: n, merged_at: "2026-11-20T10:00:00Z", base: { ref: "main" }, head: { sha: head }, user: { login: "dev" }, ...extra });
const green = { check_runs: [{ name: "ci", status: "completed", conclusion: "success" }, { name: "lint", status: "completed", conclusion: "skipped" }] };

function fakeApi(routes) {
  const calls = [];
  const api = async (path, opts = {}) => {
    calls.push({ path, ...opts });
    const key = Object.keys(routes).find((k) => path.startsWith(k));
    if (!key) throw new Error(`unexpected call ${path}`);
    return typeof routes[key] === "function" ? routes[key](path, opts) : routes[key];
  };
  return { api, calls };
}
const noSleep = async () => {};

test("audit: commits from a merged PR with green checks pass", async () => {
  const { api } = fakeApi({
    [`/repos/${REPO}/compare/aaa...bbb`]: { total_commits: 1, commits: [{ sha: "bbb" }] },
    [`/repos/${REPO}/commits/bbb/pulls`]: [pr(7, "head7")],
    [`/repos/${REPO}/commits/head7/check-runs`]: green,
    [`/repos/${REPO}/commits/head7/status`]: { statuses: [] },
    [`/repos/${REPO}/pulls/7/reviews`]: [],
  });
  const r = await audit.audit({ api, repo: REPO, event: { before: "aaa", after: "bbb" }, branch: "main", sleep: noSleep });
  assert.deepEqual(r.violations, []);
  assert.equal(r.rows[0].result, "✅ ok");
  assert.match(audit.renderReport(r, { repo: REPO, branch: "main", after: "bbb" }), /All audited commits came from merged pull requests/);
});

test("audit: a cancelled run superseded by a newer green run of the same check is not a failure", async () => {
  const run = (id, conclusion, started) => ({ id, app: { id: 15368 }, name: "data inventory gate", status: "completed", conclusion, started_at: started });
  const runs = {
    check_runs: [
      run(2, "success", "2026-11-23T10:47:35Z"),
      run(1, "cancelled", "2026-11-23T10:47:20Z"),
      { id: 3, app: { id: 15368 }, name: "ci", status: "completed", conclusion: "success", started_at: "2026-11-23T10:47:20Z" },
    ],
  };
  const { api } = fakeApi({ [`/repos/${REPO}/commits/h/check-runs`]: runs, [`/repos/${REPO}/commits/h/status`]: { statuses: [] } });
  assert.deepEqual(await audit.checksOf(api, REPO, "h"), { total: 2, failing: [], pending: [] });

  // The other way round, a newer red run still fails, and a lone cancelled run still counts.
  runs.check_runs[1] = run(1, "cancelled", "2026-11-23T10:47:50Z");
  assert.deepEqual((await audit.checksOf(api, REPO, "h")).failing, ["data inventory gate (cancelled)"]);
  assert.deepEqual(audit.latestRuns([run(5, "cancelled", "2026-11-23T10:00:00Z")]).map((r) => r.conclusion), ["cancelled"]);
});

test("audit: a run that started after the merge (the PR was marked ready as it merged) does not count", async () => {
  const run = (id, status, conclusion, started) => ({ id, app: { id: 15368 }, name: "data inventory gate", status, conclusion, started_at: started });
  const runs = { check_runs: [run(2, "in_progress", null, "2026-11-24T07:48:12Z"), run(1, "completed", "success", "2026-11-24T07:45:44Z")] };
  const { api } = fakeApi({ [`/repos/${REPO}/commits/h/check-runs`]: runs, [`/repos/${REPO}/commits/h/status`]: { statuses: [] } });
  assert.deepEqual(await audit.checksOf(api, REPO, "h", "2026-11-24T07:48:09Z"), { total: 1, failing: [], pending: [] });
  assert.deepEqual((await audit.checksOf(api, REPO, "h")).pending, ["data inventory gate"], "without a merge time every run counts");
  // A check that was still running when the PR merged is a violation.
  runs.check_runs = [run(3, "in_progress", null, "2026-11-24T07:47:00Z")];
  assert.deepEqual((await audit.checksOf(api, REPO, "h", "2026-11-24T07:48:09Z")).pending, ["data inventory gate"]);
});

test("audit: a direct push, red or missing checks, and a force push are violations", async () => {
  const { api } = fakeApi({
    [`/repos/${REPO}/compare/aaa...ddd`]: { total_commits: 3, commits: [{ sha: "bbb" }, { sha: "ccc" }, { sha: "ddd" }] },
    [`/repos/${REPO}/commits/bbb/pulls`]: [],
    [`/repos/${REPO}/commits/ccc/pulls`]: [pr(8, "head8")],
    [`/repos/${REPO}/commits/ddd/pulls`]: [pr(9, "head9")],
    [`/repos/${REPO}/commits/head8/check-runs`]: { check_runs: [{ name: "ci", status: "completed", conclusion: "failure" }, { name: "e2e", status: "in_progress" }] },
    [`/repos/${REPO}/commits/head8/status`]: { statuses: [{ context: "ext", state: "error" }] },
    [`/repos/${REPO}/commits/head9/check-runs`]: { check_runs: [] },
    [`/repos/${REPO}/commits/head9/status`]: { statuses: [] },
    [`/repos/${REPO}/pulls/`]: [],
  });
  const r = await audit.audit({ api, repo: REPO, event: { before: "aaa", after: "ddd", forced: true }, branch: "main", sleep: noSleep });
  assert.equal(r.violations.length, 4);
  assert.match(r.violations[0], /force push/);
  assert.match(r.violations[1], /bbb did not come from a merged pull request/);
  assert.match(r.violations[2], /#8\): failing: ci \(failure\), ext \(error\); not finished at merge: e2e/);
  assert.match(r.violations[3], /#9\): no checks ran/);
});

test("audit: approvals are enforced only when required, and self-approval does not count", async () => {
  const routes = {
    [`/repos/${REPO}/compare/aaa...bbb`]: { total_commits: 1, commits: [{ sha: "bbb" }] },
    [`/repos/${REPO}/commits/bbb/pulls`]: [pr(7, "head7")],
    [`/repos/${REPO}/commits/head7/check-runs`]: green,
    [`/repos/${REPO}/commits/head7/status`]: { statuses: [] },
    [`/repos/${REPO}/pulls/7/reviews`]: [{ state: "APPROVED", user: { login: "dev" } }],
  };
  const event = { before: "aaa", after: "bbb" };
  assert.deepEqual((await audit.audit({ api: fakeApi(routes).api, repo: REPO, event, branch: "main", sleep: noSleep })).violations, []);
  const strict = await audit.audit({ api: fakeApi(routes).api, repo: REPO, event, branch: "main", requireApproval: true, sleep: noSleep });
  assert.match(strict.violations[0], /no approving review by someone other than the author/);
});

test("audit: a newly created branch audits only its head and does not fail on the initial push", async () => {
  const { api } = fakeApi({ [`/repos/${REPO}/commits/bbb/pulls`]: [] });
  const r = await audit.audit({ api, repo: REPO, event: { before: "0".repeat(40), after: "bbb" }, branch: "main", sleep: noSleep });
  assert.deepEqual(r.violations, []);
  assert.equal(r.rows[0].result, "initial push, not audited");
});

test("audit: PR association lag is retried a bounded number of times; PRs into other branches do not count", async () => {
  let n = 0;
  const { api } = fakeApi({ [`/repos/${REPO}/commits/bbb/pulls`]: () => (++n < 3 ? [pr(5, "h", { base: { ref: "develop" } })] : [pr(6, "h6")]) });
  assert.equal((await audit.mergedPullFor(api, REPO, "bbb", "main", { sleep: noSleep })).number, 6);
  n = -100;
  assert.equal(await audit.mergedPullFor(api, REPO, "bbb", "main", { attempts: 3, sleep: noSleep }), null);
});

test("audit: the API client retries transient errors and gives up on others", async () => {
  const statuses = [502, 200];
  const fetchImpl = async () => {
    const status = statuses.shift();
    return { ok: status === 200, status, json: async () => ({ ok: true }) };
  };
  const api = audit.makeApi({ token: "t", fetchImpl, sleep: noSleep });
  assert.deepEqual(await api("/x"), { ok: true });
  const denied = audit.makeApi({ token: "t", fetchImpl: async () => ({ ok: false, status: 403 }), sleep: noSleep });
  await assert.rejects(denied("/y"), /returned 403/);
});

// ---------- dependency gate ----------

const POLICY = { allow: ["MIT", "Apache-2.0", "ISC"], blockAt: 7 };
const osvPkg = (name, version, extra = {}) => ({ package: { name, version, ecosystem: "npm", purl: `pkg:npm/${name}@${version}?source=PUBLIC_REGISTRY` }, ...extra });
// Shaped like real OSV-Scanner 2.7.1 output (iae-sample-fullstack, 2026-11-23).
const OSV = {
  results: [
    {
      source: { path: "/repo/package-lock.json", type: "lockfile" },
      packages: [
        osvPkg("esbuild", "0.18.20", { dependency_groups: ["dev"], groups: [{ ids: ["GHSA-67mh-4wv8-2f99"], aliases: ["GHSA-67mh-4wv8-2f99"], max_severity: "5.3" }], vulnerabilities: [{ id: "GHSA-67mh-4wv8-2f99", database_specific: { severity: "MODERATE" } }] }),
        osvPkg("undici", "6.0.0", { groups: [{ ids: ["GHSA-aaaa-bbbb-cccc"], aliases: [], max_severity: "7.5" }], vulnerabilities: [{ id: "GHSA-aaaa-bbbb-cccc" }] }),
        osvPkg("evil-pkg", "1.0.0", { groups: [{ ids: ["MAL-2026-1"], aliases: [], max_severity: "" }], vulnerabilities: [{ id: "MAL-2026-1" }] }),
        osvPkg("old-lib", "2.0.0", { groups: [{ ids: ["PYSEC-1"], aliases: [], max_severity: "" }], vulnerabilities: [{ id: "PYSEC-1" }] }),
        osvPkg("text-only", "1.0.0", { groups: [{ ids: ["GHSA-x"], aliases: [], max_severity: "" }], vulnerabilities: [{ id: "GHSA-x", database_specific: { severity: "LOW" } }] }),
        { package: { name: "@acme/api", version: "0.1.0", ecosystem: "npm", purl: "pkg:npm/%40acme/api@0.1.0?source=LOCAL" }, licenses: ["UNKNOWN"], license_violations: ["UNKNOWN"] },
        { package: { name: "@other/local", version: "1.0.0", ecosystem: "npm", purl: "pkg:npm/%40other/local@1.0.0?source=LOCAL" }, licenses: ["UNKNOWN"], license_violations: ["UNKNOWN"] },
        osvPkg("caniuse-lite", "1.0.0", { licenses: ["CC-BY-4.0"], license_violations: ["CC-BY-4.0"] }),
      ],
    },
  ],
};

test("dependency gate: policy comes from the project config and fails closed when it is missing or malformed", () => {
  assert.deepEqual(depgate.loadPolicy(JSON.stringify({ governance: { licenses: { allow: ["MIT"] }, vulnerabilities: { blockAtOrAbove: 9 } } })), { allow: ["MIT"], blockAt: 9, exclude: [] });
  assert.deepEqual(depgate.loadPolicy(JSON.stringify({ governance: { licenses: { allow: ["MIT"] }, dependencyScan: { exclude: ["fixtures/**"] } } })).exclude, ["fixtures/**"]);
  assert.throws(() => depgate.loadPolicy(JSON.stringify({ governance: { licenses: { allow: ["MIT"] }, dependencyScan: { exclude: ["a b"] } } })), /directory globs/);
  assert.equal(depgate.loadPolicy(JSON.stringify({ governance: { licenses: { allow: ["MIT"] } } })).blockAt, 7);
  assert.throws(() => depgate.loadPolicy(""), /not valid JSON/);
  assert.throws(() => depgate.loadPolicy(JSON.stringify({ governance: { licenses: { allow: [] } } })), /non-empty list/);
  assert.throws(() => depgate.loadPolicy(JSON.stringify({ governance: { licenses: { allow: ["MIT; rm -rf /"] } } })), /SPDX/);
  assert.throws(() => depgate.loadPolicy(JSON.stringify({ governance: { licenses: { allow: ["MIT"] }, vulnerabilities: { blockAtOrAbove: 11 } } })), /0 to 10/);
});

test("dependency gate: High and above, malicious and unknown severities block; Medium and Low are reported", () => {
  const r = depgate.evaluate(OSV, POLICY, new Set(["@acme/api"]));
  const by = (list) => Object.fromEntries(list.map((f) => [f.name, f]));
  const block = by(r.blocking);
  const report = by(r.reported);
  assert.equal(report.esbuild.severity, "5.3");
  assert.equal(report.esbuild.scope, "dev");
  assert.equal(report["text-only"].severity, "LOW");
  assert.match(block.undici.reason, /CVSS 7.5 >= 7/);
  assert.equal(block["evil-pkg"].severity, "malicious");
  assert.equal(block["old-lib"].severity, "unknown");
  assert.match(block["caniuse-lite"].finding, /CC-BY-4.0/);
  // A LOCAL package is first-party only when a package.json in the repository declares it.
  assert.ok(block["@other/local"]);
  assert.deepEqual(r.skipped.map((s) => s.name), ["@acme/api"]);
  assert.equal(depgate.evaluate(OSV, { ...POLICY, blockAt: 8 }, new Set()).blocking.some((f) => f.name === "undici"), false);
});

test("dependency gate: first-party names come from the repository's package.json files, not node_modules", () => {
  const root = mkdtempSync(join(tmpdir(), "iae-depgate-"));
  put(root, "package.json", JSON.stringify({ name: "acme", workspaces: ["apps/*"] }));
  put(root, "apps/api/package.json", JSON.stringify({ name: "@acme/api" }));
  put(root, "node_modules/left-pad/package.json", JSON.stringify({ name: "left-pad" }));
  put(root, "apps/broken/package.json", "{ not json");
  assert.deepEqual([...depgate.firstPartyNames(root)].sort(), ["@acme/api", "acme"]);
});

test("dependency gate: the summary lists blocking, reported and skipped findings", () => {
  const md = depgate.renderSummary(depgate.evaluate(OSV, POLICY, new Set(["@acme/api"])), POLICY);
  assert.match(md, /Scanned \d+ package\(s\) from 1 source\(s\): `[^`]+`\./);
  assert.match(md, /### Blocking \(5\)/);
  assert.match(md, /### Reported, not blocking \(2\)/);
  assert.match(md, /license check skipped \(1\)/);
  assert.match(md, /osv-scanner\.toml/);
  assert.match(depgate.renderSummary({ blocking: [], reported: [], skipped: [] }, POLICY), /### Blocking \(0\)\n\nNone\./);
});

test("dependency gate: scanner exit codes 0/1 carry results, 128 means no lockfiles, others fail closed", () => {
  const fake = (status, stdout = "", stderr = "") => () => ({ status, stdout, stderr });
  let args;
  const spy = (bin, a) => {
    args = a;
    return { status: 1, stdout: JSON.stringify(OSV) };
  };
  assert.equal(depgate.scan(POLICY, { spawn: spy }).results.length, 1);
  assert.ok(args.includes("--licenses=MIT,Apache-2.0,ISC") && args.includes("json"));
  assert.ok(args.includes("--all-packages"), "every package is listed, so the summary can say how much was scanned");
  depgate.scan({ ...POLICY, exclude: ["fixtures/**"] }, { spawn: spy });
  assert.ok(args.includes("--x-exclude=g:**/fixtures/**"));
  assert.equal(depgate.scan(POLICY, { spawn: fake(128) }), null);
  assert.throws(() => depgate.scan(POLICY, { spawn: fake(127, "", "dial tcp: i/o timeout") }), /exited with 127:\ndial tcp/);
  assert.throws(() => depgate.scan(POLICY, { spawn: fake(0, "not json") }), /did not print JSON/);
  assert.throws(() => depgate.scan(POLICY, { spawn: () => ({ error: new Error("ENOENT") }) }), /could not run/);
});

test("dependency gate: one report issue is created, updated, and closed when nothing is left", async () => {
  const title = depgate.ISSUE_TITLE;
  let open = [];
  const { api, calls } = fakeApi({
    [`/repos/${REPO}/issues?`]: () => open,
    [`/repos/${REPO}/issues/`]: () => ({}),
    [`/repos/${REPO}/issues`]: () => ({ number: 41 }),
  });
  assert.deepEqual(await depgate.upsertReportIssue(api, REPO, [{}], "b"), { action: "created", number: 41 });
  open = [{ number: 41, title }, { number: 3, title, pull_request: {} }];
  assert.deepEqual(await depgate.upsertReportIssue(api, REPO, [{}], "b2"), { action: "updated", number: 41 });
  assert.deepEqual(await depgate.upsertReportIssue(api, REPO, [], "none"), { action: "closed", number: 41 });
  assert.equal(calls.at(-1).body.state, "closed");
  open = [];
  assert.deepEqual(await depgate.upsertReportIssue(api, REPO, [], "none"), { action: "none" });
});

test("dependency gate CLI: exit 1 on blocking findings, 0 on reported-only, 2 without a policy", () => {
  const root = mkdtempSync(join(tmpdir(), "iae-depgate-cli-"));
  put(root, ".claude/ideal-agentic-env.json", JSON.stringify({ governance: { licenses: { allow: POLICY.allow }, vulnerabilities: { blockAtOrAbove: 7 } } }));
  put(root, "package.json", JSON.stringify({ name: "@acme/api" }));
  put(root, "all.json", JSON.stringify(OSV));
  put(root, "medium.json", JSON.stringify({ results: [{ source: { path: "/r/package-lock.json" }, packages: [OSV.results[0].packages[0], OSV.results[0].packages[5]] }] }));
  const run = (...a) => spawnSync(process.execPath, [rendered["dependency-gate.mjs"], ...a], { cwd: root, encoding: "utf8", env: { ...process.env, GITHUB_STEP_SUMMARY: "" } });
  const all = run("--input", "all.json");
  assert.equal(all.status, 1, all.stderr);
  assert.match(all.stdout, /::error::undici@6\.0\.0/);
  assert.equal(run("--input", "medium.json").status, 0);
  assert.equal(run("--bogus").status, 2);
  const bare = mkdtempSync(join(tmpdir(), "iae-depgate-bare-"));
  const none = spawnSync(process.execPath, [rendered["dependency-gate.mjs"], "--input", join(root, "all.json")], { cwd: bare, encoding: "utf8" });
  assert.equal(none.status, 2);
  assert.match(none.stderr, /run \/governance:setup/);
});

test("dependency gate, Maven: the resolved tree of each outermost pom is scanned as an SBOM; failure fails closed", () => {
  const root = mkdtempSync(join(tmpdir(), "iae-gate-maven-"));
  put(root, "pom.xml", "<project><groupId>com.example</groupId><artifactId>shop</artifactId><modules><module>api</module></modules></project>");
  put(root, "api/pom.xml", "<project><parent><groupId>com.example</groupId><artifactId>shop</artifactId></parent><artifactId>shop-api</artifactId><dependencies><dependency><groupId>x</groupId><artifactId>y</artifactId></dependency></dependencies></project>");
  put(root, "mvnw", "#!/bin/sh\n");
  put(root, "fixtures/demo/pom.xml", "<project/>");
  assert.deepEqual(depgate.mavenRoots(root, ["fixtures/**"]), [""], "outermost pom only; excluded globs skipped");
  assert.deepEqual([...depgate.firstPartyNames(root)].sort(), ["com.example:shop", "com.example:shop-api"], "a module inherits its groupId from the parent");

  const calls = [];
  const ok = (bin, args, opts) => {
    calls.push({ bin, args, cwd: opts.cwd });
    put(opts.cwd, "target/iae-dependency-gate.json", JSON.stringify({ bomFormat: "CycloneDX", components: [
      { group: "x", name: "y", version: "1.0", purl: "pkg:maven/x/y@1.0?type=jar", licenses: [{ license: { id: "Apache-2.0" } }] },
      { group: "ch.qos.logback", name: "logback-core", version: "1.5.38", licenses: [{ license: { id: "EPL-1.0" } }, { license: { name: "GNU Lesser General Public License" } }] },
      { group: "com.example", name: "shop-api", version: "1.0" },
    ] }));
    return { status: 0, stdout: "", stderr: "" };
  };
  const out = mkdtempSync(join(tmpdir(), "iae-gate-sbom-"));
  const r = depgate.mavenTrees(root, { exclude: ["fixtures/**"] }, { spawn: ok, outDir: out, platform: "linux" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].bin, "./mvnw");
  assert.ok(calls[0].args.includes(`${depgate.CYCLONEDX_MAVEN}:makeAggregateBom`) && calls[0].args.includes("-DincludeTestScope=false"));
  assert.deepEqual(Object.values(r.aliases), ["pom.xml (Maven tree)"]);
  assert.match(readFileSync(r.paths[0], "utf8"), /"pkg:maven\/x\/y@1\.0"/, "purl qualifiers are dropped for the license lookup");

  let args;
  depgate.scan({ allow: ["MIT"], blockAt: 7, exclude: [] }, { spawn: (bin, a) => ((args = a), { status: 0, stdout: "{}" }), extra: r.paths });
  assert.ok(args.includes("--x-disable-plugins=java/pomxml") && args.includes(r.paths[0]));

  const fail = () => ({ status: 1, stdout: "", stderr: "[ERROR] Could not resolve dependencies" });
  assert.throws(() => depgate.mavenTrees(root, { exclude: [] }, { spawn: fail, outDir: out, platform: "linux" }), /could not resolve the Maven dependency tree of pom\.xml[\s\S]*fails closed[\s\S]*Could not resolve dependencies/);

  // First-party modules of the build are skipped by the license check; the summary names the pom.
  const osv = { results: [{ source: { path: r.paths[0] }, packages: [
    { package: { name: "com.example:shop-api", version: "1.0", ecosystem: "Maven" }, license_violations: ["UNKNOWN"] },
    { package: { name: "ch.qos.logback:logback-core", version: "1.5.38", ecosystem: "Maven" }, license_violations: ["EPL-1.0", "LGPL-2.1-only"] },
  ] }] };
  osv.results[0].packages.push({ package: { name: "x:y", version: "1.0", ecosystem: "Maven" }, license_violations: ["UNKNOWN"] });
  const e = depgate.evaluate(osv, { allow: ["MIT", "Apache-2.0"], blockAt: 7 }, depgate.firstPartyNames(root), root, r.aliases, r.licenses);
  assert.deepEqual(e.skipped.map((s) => s.name), ["com.example:shop-api"]);
  assert.deepEqual(e.blocking.map((b) => [b.name, b.finding, b.source]), [["ch.qos.logback:logback-core", "license EPL-1.0, GNU Lesser General Public License", "pom.xml (Maven tree)"]], "the SBOM's licenses replace the scanner's UNKNOWN");

  // Several pom licenses are a choice; an AND expression needs every part; no license is UNKNOWN.
  assert.deepEqual(depgate.mavenLicenseViolations(["Apache-2.0", "BSD-4-Clause"], ["Apache-2.0"]), []);
  assert.deepEqual(depgate.mavenLicenseViolations(["EPL-2.0", "LGPL-2.1-only"], ["Apache-2.0"]), ["EPL-2.0", "LGPL-2.1-only"]);
  assert.deepEqual(depgate.mavenLicenseViolations(["EPL-2.0 OR Apache-2.0"], ["Apache-2.0"]), []);
  assert.deepEqual(depgate.mavenLicenseViolations(["EPL-2.0 AND Apache-2.0"], ["Apache-2.0"]), ["EPL-2.0 AND Apache-2.0"]);
  assert.deepEqual(depgate.mavenLicenseViolations([], ["Apache-2.0"]), ["UNKNOWN"]);

  // osv-scanner.toml license overrides apply to the SBOM's licenses until they expire.
  const toml = `[[PackageOverrides]]\nname = "ch.qos.logback:logback-core"\necosystem = "Maven"\nlicense.ignore = true\neffectiveUntil = 2027-05-31\nreason = "x"\n\n[[PackageOverrides]]\nname = "old:pkg"\nlicense.ignore = true\neffectiveUntil = 2020-01-01\nreason = "x"\n\n[[PackageOverrides]]\nname = "vuln:only"\nvulnerability.ignore = true\nreason = "x"\n`;
  const ov = depgate.licenseOverrides(toml, new Date("2026-11-24"));
  assert.deepEqual(ov, [{ name: "ch.qos.logback:logback-core", ecosystem: "Maven" }]);
  const e2 = depgate.evaluate(osv, { allow: ["MIT", "Apache-2.0"], blockAt: 7 }, depgate.firstPartyNames(root), root, r.aliases, r.licenses, ov);
  assert.deepEqual(e2.blocking, []);
});
