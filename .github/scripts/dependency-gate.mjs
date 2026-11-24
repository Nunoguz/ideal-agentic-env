#!/usr/bin/env node
// Managed by governance 1.0.0 (ideal-agentic-env). /governance:setup --refresh updates this file while it is unedited; edit it and setup leaves it alone. sha256:4b860f8da70cd2dd
// Dependency gate (ideal-agentic-env/governance). Runs OSV-Scanner over every lockfile and applies the
// project's policy from .claude/ideal-agentic-env.json:
//   governance.vulnerabilities.blockAtOrAbove  CVSS base score that fails the gate (default 7.0, High)
//   governance.licenses.allow                  SPDX identifiers allowed for third-party dependencies
//   governance.dependencyScan.exclude          optional directory globs the scan skips (for example "fixtures/**")
// Always blocking: malicious packages (MAL-*), findings without any severity, and licenses outside the
// allowlist. Vulnerabilities below the threshold are reported (job summary) and do not fail the gate.
// First-party packages (a lockfile entry the scanner marks LOCAL whose name a package.json in this
// repository declares, such as npm workspace members, and the modules of this repository's Maven build)
// are skipped by the license check.
// Maven has no lockfile, and OSV-Scanner cannot resolve versions that a parent pom or an imported BOM
// manages (every Spring Boot project), so it would scan nothing. For each outermost pom.xml the gate asks
// Maven for the resolved tree as a CycloneDX SBOM (compile and runtime scope, not test) and scans that
// instead. If Maven cannot resolve the tree, the gate fails: a scan that sees nothing is not a pass.
// OSV-Scanner's license lookup returns nothing for Maven packages, so their licenses come from the SBOM
// (Maven copies them from each package's pom). Several licenses listed in a pom are a choice (dual
// licensing; repository owner's decision, 2026-11-24): one allowed license is enough. An SPDX expression
// passes when its OR branches include an allowed one, or when every AND part is allowed. A package with no
// license in its pom is UNKNOWN and blocks. [[PackageOverrides]] with license.ignore in osv-scanner.toml
// apply to these packages too, until their effectiveUntil date.
// Exceptions: [[IgnoredVulns]] / [[PackageOverrides]] in osv-scanner.toml, with a reason and an expiry,
// in a reviewed pull request. The repository owner decides them.
//
//   node .github/scripts/dependency-gate.mjs [--input osv.json] [--report-issue]
//
//   --input         read OSV-Scanner JSON from a file instead of running the scanner
//   --report-issue  keep one open "[vulnerability-report]" issue listing the non-blocking findings
//                   (scheduled runs; needs GITHUB_TOKEN with issues: write). Never fails on findings.
// Environment: OSV_SCANNER (scanner binary, default osv-scanner), GITHUB_STEP_SUMMARY, GITHUB_TOKEN,
// GITHUB_REPOSITORY, GITHUB_API_URL. Zero dependencies (Node >= 20).
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const CONFIG = ".claude/ideal-agentic-env.json";
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", ".nuxt", ".output", "out", "coverage", "vendor", ".venv", "venv", "target", "bin", "obj"]);
const TEXT_SEVERITY = { CRITICAL: "block", HIGH: "block", MODERATE: "report", MEDIUM: "report", LOW: "report" };
export const ISSUE_TITLE = "[vulnerability-report] Non-blocking dependency vulnerabilities";
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
// Pinned like the scanners: a release published at least 14 days before it was chosen (2026-07-30).
export const CYCLONEDX_MAVEN = "org.cyclonedx:cyclonedx-maven-plugin:2.9.3";
const SBOM_NAME = "iae-dependency-gate";

/** The policy from the project config. Anything missing or malformed is an error: the gate fails closed. */
export function loadPolicy(text) {
  let cfg;
  try {
    cfg = JSON.parse(text);
  } catch {
    throw new Error(`${CONFIG} is missing or not valid JSON; run /governance:setup`);
  }
  const allow = cfg?.governance?.licenses?.allow;
  const blockAt = cfg?.governance?.vulnerabilities?.blockAtOrAbove ?? 7;
  if (!Array.isArray(allow) || !allow.length || allow.some((l) => typeof l !== "string" || !/^[\w.+-]+$/.test(l)))
    throw new Error(`${CONFIG}: governance.licenses.allow must be a non-empty list of SPDX identifiers; run /governance:setup`);
  if (typeof blockAt !== "number" || blockAt < 0 || blockAt > 10) throw new Error(`${CONFIG}: governance.vulnerabilities.blockAtOrAbove must be a CVSS score from 0 to 10`);
  const exclude = cfg?.governance?.dependencyScan?.exclude ?? [];
  if (!Array.isArray(exclude) || exclude.some((g) => typeof g !== "string" || !/^[\w./*-]+$/.test(g))) throw new Error(`${CONFIG}: governance.dependencyScan.exclude must be a list of directory globs`);
  return { allow, blockAt, exclude };
}

/** Names declared by package.json files in the repository (workspace members and the root package). */
export function firstPartyNames(root) {
  const names = new Set();
  const visit = (dir, depth) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && depth < 6) visit(join(dir, e.name), depth + 1);
      } else if (e.name === "pom.xml") {
        const xml = readFileSync(join(dir, e.name), "utf8").replace(/<!--[\s\S]*?-->/g, "");
        const own = xml.replace(/<(parent|dependencies|dependencyManagement|build|profiles|reporting)>[\s\S]*?<\/\1>/g, "");
        const artifact = /<artifactId>\s*([^<\s]+)\s*<\/artifactId>/.exec(own)?.[1];
        const group = /<groupId>\s*([^<\s]+)\s*<\/groupId>/.exec(own)?.[1] ?? /<parent>[\s\S]*?<groupId>\s*([^<\s]+)\s*<\/groupId>/.exec(xml)?.[1];
        if (artifact && group) names.add(`${group}:${artifact}`);
      } else if (e.name === "package.json") {
        try {
          const name = JSON.parse(readFileSync(join(dir, e.name), "utf8"))?.name;
          if (typeof name === "string" && name) names.add(name);
        } catch {
          /* not JSON: not a package */
        }
      }
    }
  };
  visit(root, 0);
  return names;
}

const isLocal = (pkg) => /[?&]source=LOCAL\b/.test(pkg?.purl ?? "") || pkg?.ecosystem === "Maven";

const globRe = (g) => new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\/?/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*")}$`); // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp -- globs from the protected project config, metacharacters escaped

/** Directories (relative, "" for the root) of the outermost pom.xml files, outside excluded globs. */
export function mavenRoots(root, exclude = []) {
  const res = exclude.map(globRe);
  const out = [];
  const visit = (rel, depth) => {
    if (rel && res.some((re) => re.test(rel) || re.test(`${rel}/`))) return;
    if (existsSync(join(root, rel, "pom.xml"))) return void out.push(rel);
    let entries = [];
    try {
      entries = readdirSync(join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) if (e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith(".") && depth < 6) visit(rel ? `${rel}/${e.name}` : e.name, depth + 1);
  };
  visit("", 0);
  return out;
}

/**
 * Resolve each Maven build's dependency tree into a CycloneDX SBOM in `outDir` (through the build's wrapper,
 * else mvn). Returns { paths, aliases }: the SBOM files to scan, and how to name them in the summary.
 */
export function mavenTrees(root, policy, { spawn = spawnSync, outDir = null, platform = process.platform } = {}) {
  const dirs = mavenRoots(root, policy.exclude ?? []);
  if (!dirs.length) return { paths: [], aliases: {}, licenses: {} };
  const out = outDir ?? mkdtempSync(join(process.env.RUNNER_TEMP || tmpdir(), "iae-gate-"));
  const paths = [];
  const aliases = {};
  const licenses = {};
  dirs.forEach((rel, i) => {
    const dir = join(root, rel);
    const wrapper = existsSync(join(dir, platform === "win32" ? "mvnw.cmd" : "mvnw"));
    const bin = wrapper ? (platform === "win32" ? "mvnw.cmd" : "./mvnw") : "mvn";
    const args = ["-B", "-ntp", "-q", `${CYCLONEDX_MAVEN}:makeAggregateBom`, "-DoutputFormat=json", `-DoutputName=${SBOM_NAME}`, "-DincludeTestScope=false"];
    const r = spawn(bin, args, { cwd: dir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, windowsHide: true, shell: platform === "win32" }); // nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true -- fixed arguments; Windows needs a shell for mvnw.cmd
    const bom = join(dir, "target", `${SBOM_NAME}.json`);
    const where = `${rel ? `${rel}/` : ""}pom.xml`;
    if (r.error || r.status !== 0 || !existsSync(bom))
      throw new Error(`could not resolve the Maven dependency tree of ${where} (${bin} ${CYCLONEDX_MAVEN}:makeAggregateBom${r.error ? `: ${r.error.message}` : `, exit ${r.status}`}); the gate fails closed:\n${String(r.stderr || r.stdout || "").trim().split("\n").slice(-10).join("\n")}`);
    const copy = join(out, `${i}.cdx.json`);
    // Maven purls carry qualifiers (?type=jar); OSV-Scanner's license lookup (deps.dev) misses them, so drop them.
    const sbom = JSON.parse(readFileSync(bom, "utf8"));
    for (const c of sbom.components ?? []) {
      if (typeof c.purl === "string") c.purl = c.purl.replace(/\?.*$/, "");
      licenses[`${c.group ? `${c.group}:` : ""}${c.name}@${c.version}`] = (c.licenses ?? []).map((l) => l.expression ?? l.license?.id ?? l.license?.name).filter(Boolean);
    }
    writeFileSync(copy, JSON.stringify(sbom));
    paths.push(copy);
    aliases[copy] = `${where} (Maven tree)`;
  });
  return { paths, aliases, licenses };
}

/** The licenses of a Maven package (from the SBOM) when none of them is allowed; [] when one is. */
export function mavenLicenseViolations(declared, allow) {
  if (!declared?.length) return ["UNKNOWN"];
  const ok = (id) => allow.includes(id.replace(/^\(|\)$/g, "").trim());
  const allowed = (entry) => {
    const parts = entry.split(/\s+(OR|AND)\s+/);
    const ids = parts.filter((_, i) => i % 2 === 0);
    const onlyOr = parts.filter((_, i) => i % 2 === 1).every((op) => op === "OR");
    return onlyOr ? ids.some(ok) : ids.every(ok);
  };
  return declared.some(allowed) ? [] : declared;
}

/** `[[PackageOverrides]]` entries of osv-scanner.toml that ignore a package's license and have not expired. */
export function licenseOverrides(text, now = new Date()) {
  const out = [];
  for (const block of String(text ?? "").split(/^\s*\[\[/m).filter((b) => b.startsWith("PackageOverrides]]"))) {
    const body = block.split(/^\s*\[(?!PackageOverrides\.license\])/m)[0];
    const name = /^\s*name\s*=\s*"([^"]+)"/m.exec(body)?.[1];
    const ecosystem = /^\s*ecosystem\s*=\s*"([^"]+)"/m.exec(body)?.[1];
    const ignored = /^\s*license\.ignore\s*=\s*true\b/m.test(body) || /\[PackageOverrides\.license\][^[]*^\s*ignore\s*=\s*true\b/m.test(body);
    const until = /^\s*effectiveUntil\s*=\s*(\d{4}-\d{2}-\d{2})/m.exec(body)?.[1];
    if (name && ignored && (!until || Date.parse(until) >= now.getTime() - 864e5)) out.push({ name, ecosystem: ecosystem ?? null });
  }
  return out;
}
const scopeOf = (p) => ((p.dependency_groups ?? []).includes("dev") ? "dev" : "runtime");

/** How one vulnerability group is treated: { verdict: "block" | "report", severity, reason }. */
export function classify(group, vulns, blockAt) {
  const ids = [...(group.ids ?? []), ...(group.aliases ?? [])];
  if (ids.some((id) => String(id).startsWith("MAL-"))) return { verdict: "block", severity: "malicious", reason: "malicious package" };
  const score = Number.parseFloat(group.max_severity);
  if (Number.isFinite(score)) return { verdict: score >= blockAt ? "block" : "report", severity: score.toFixed(1), reason: score >= blockAt ? `CVSS ${score.toFixed(1)} >= ${blockAt}` : `CVSS ${score.toFixed(1)}` };
  const texts = vulns.filter((v) => ids.includes(v.id)).map((v) => String(v.database_specific?.severity ?? "").toUpperCase()).filter(Boolean);
  if (texts.some((t) => TEXT_SEVERITY[t] === "block")) return { verdict: "block", severity: texts.join("/"), reason: `advisory severity ${texts.join("/")}` };
  if (texts.length && texts.every((t) => TEXT_SEVERITY[t] === "report")) return { verdict: "report", severity: texts.join("/"), reason: `advisory severity ${texts.join("/")}` };
  return { verdict: "block", severity: "unknown", reason: "no severity published (fail closed)" };
}

/** Apply the policy to OSV-Scanner JSON. Lockfile paths are shown relative to `root`. */
export function evaluate(osv, policy, firstParty = new Set(), root = process.cwd(), aliases = {}, mavenLicenses = null, overrides = []) {
  const blocking = [];
  const reported = [];
  const skipped = [];
  const scanned = { packages: 0, sources: [] };
  for (const result of osv?.results ?? []) {
    const path = String(result.source?.path ?? "");
    const alias = Object.entries(aliases).find(([file]) => path === file || realOr(path) === realOr(file))?.[1];
    const source = alias ?? ((isAbsolute(path) ? relative(root, path) : path).replace(/\\/g, "/") || path);
    scanned.sources.push(source);
    scanned.packages += (result.packages ?? []).length;
    for (const p of result.packages ?? []) {
      const pkg = p.package ?? {};
      const base = { name: pkg.name, version: pkg.version, ecosystem: pkg.ecosystem, scope: scopeOf(p), source };
      // Maven trees: the SBOM's own licenses replace the scanner's (empty) lookup.
      const fromSbom = mavenLicenses && alias && pkg.ecosystem === "Maven";
      const overridden = overrides.some((o) => o.name === pkg.name && (!o.ecosystem || o.ecosystem.toLowerCase() === "maven"));
      const violations = fromSbom ? (overridden ? [] : mavenLicenseViolations(mavenLicenses[`${pkg.name}@${pkg.version}`], policy.allow)) : p.license_violations ?? [];
      if (violations.length) {
        if (isLocal(pkg) && firstParty.has(pkg.name)) skipped.push(base);
        else blocking.push({ ...base, finding: `license ${violations.join(", ")}`, severity: "license", reason: "not in governance.licenses.allow" });
      }
      for (const group of p.groups ?? []) {
        const c = classify(group, p.vulnerabilities ?? [], policy.blockAt);
        const finding = [...new Set(group.ids ?? [])].join(", ");
        (c.verdict === "block" ? blocking : reported).push({ ...base, finding, severity: c.severity, reason: c.reason });
      }
    }
  }
  return { blocking, reported, skipped, scanned };
}

function realOr(p) {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

const row = (f) => `| ${f.name}@${f.version} | ${f.ecosystem ?? ""} | ${f.scope} | ${f.finding} | ${f.severity} | ${f.source} |`;
const table = (items) => ["| Package | Ecosystem | Scope | Finding | Severity | Lockfile |", "| --- | --- | --- | --- | --- | --- |", ...items.map(row)];

export function renderSummary({ blocking, reported, skipped, scanned }, policy) {
  const lines = [
    "## Dependency gate",
    "",
    // The scan's reach, so a green gate that saw nothing (an unsupported manifest) is visible.
    ...(scanned ? [`Scanned ${scanned.packages} package(s) from ${scanned.sources.length} source(s)${scanned.sources.length ? `: ${scanned.sources.map((s) => `\`${s}\``).join(", ")}` : ""}.`, ""] : []),
    `Policy: CVSS >= ${policy.blockAt.toFixed(1)}, malicious packages (MAL-*), findings without a severity and licenses outside \`governance.licenses.allow\` fail the gate. Lower severities are reported only.`,
    "",
    `### Blocking (${blocking.length})`,
    ...(blocking.length ? ["", ...table(blocking)] : ["", "None."]),
    "",
    `### Reported, not blocking (${reported.length})`,
    ...(reported.length ? ["", ...table(reported)] : ["", "None."]),
  ];
  if (skipped.length) lines.push("", `### First-party packages, license check skipped (${skipped.length})`, "", skipped.map((s) => `\`${s.name}\``).join(", "));
  if (blocking.length)
    lines.push("", "Fix: upgrade the dependency. If you cannot, the repository owner may accept an exception in `osv-scanner.toml` (`[[IgnoredVulns]]` with `ignoreUntil`, or `[[PackageOverrides]]` with `effectiveUntil`), each with a `reason`, in a reviewed pull request.");
  return lines.join("\n");
}

/** Run OSV-Scanner. Exit 0 and 1 carry results; 128 means no lockfiles; anything else is an error. */
export function scan(policy, { bin = process.env.OSV_SCANNER || "osv-scanner", spawn = spawnSync, cwd = process.cwd(), extra = [] } = {}) {
  const args = [
    "scan", "source", "-r", ".", "--format", "json", "--all-packages", `--licenses=${policy.allow.join(",")}`,
    ...(policy.exclude ?? []).map((g) => `--x-exclude=g:${g.startsWith("**/") ? g : `**/${g}`}`), // OSV-Scanner matches the glob against absolute paths
    // With the Maven trees resolved, the bare pom.xml extractor would only add versionless, unscannable entries.
    ...(extra.length ? ["--x-disable-plugins=java/pomxml", ...extra] : []),
  ];
  const r = spawn(bin, args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, windowsHide: true });
  if (r.error) throw new Error(`could not run ${bin}: ${r.error.message}`);
  if (r.status === 128) return null;
  if (r.status !== 0 && r.status !== 1) throw new Error(`${bin} exited with ${r.status}:\n${String(r.stderr ?? "").trim().split("\n").slice(-10).join("\n")}`);
  try {
    return JSON.parse(r.stdout);
  } catch {
    throw new Error(`${bin} did not print JSON`);
  }
}

export function makeApi({ token, base = "https://api.github.com", fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  return async function api(path, { method = "GET", body } = {}) {
    for (let attempt = 1; ; attempt++) {
      const res = await fetchImpl(`${base}${path}`, {
        method,
        headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.ok) return res.status === 204 ? null : res.json();
      if (attempt >= 3 || !RETRYABLE.has(res.status)) throw new Error(`GitHub API ${method} ${path} returned ${res.status}`);
      await sleep(2000 * attempt);
    }
  };
}

/** Keep exactly one open report issue: create or update it while there are findings, close it when there are none. */
export async function upsertReportIssue(api, repo, reported, body) {
  let existing = null;
  for (let page = 1; page <= 5 && !existing; page++) {
    const issues = await api(`/repos/${repo}/issues?state=open&per_page=100&page=${page}`);
    existing = (issues ?? []).find((i) => !i.pull_request && i.title === ISSUE_TITLE) ?? null;
    if ((issues ?? []).length < 100) break;
  }
  if (!reported.length) {
    if (!existing) return { action: "none" };
    await api(`/repos/${repo}/issues/${existing.number}`, { method: "PATCH", body: { state: "closed", body } });
    return { action: "closed", number: existing.number };
  }
  if (existing) {
    await api(`/repos/${repo}/issues/${existing.number}`, { method: "PATCH", body: { body } });
    return { action: "updated", number: existing.number };
  }
  const created = await api(`/repos/${repo}/issues`, { method: "POST", body: { title: ISSUE_TITLE, body } });
  return { action: "created", number: created?.number };
}

const isMain = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const args = process.argv.slice(2);
    const known = new Set(["--input", "--report-issue"]);
    for (let i = 0; i < args.length; i++) {
      if (!known.has(args[i])) throw new Error(`unknown argument: ${args[i]}`);
      if (args[i] === "--input") i++;
    }
    const input = args.includes("--input") ? args[args.indexOf("--input") + 1] : null;
    if (args.includes("--input") && !input) throw new Error("--input needs a file");
    let configText = "";
    try {
      configText = readFileSync(CONFIG, "utf8");
    } catch {
      /* loadPolicy reports it */
    }
    const policy = loadPolicy(configText);
    const maven = input ? { paths: [], aliases: {}, licenses: {} } : mavenTrees(".", policy);
    const osv = input ? JSON.parse(readFileSync(input, "utf8")) : scan(policy, { extra: maven.paths });
    if (!osv) {
      console.log("No lockfiles found: nothing to scan.");
      process.exit(0);
    }
    let toml = "";
    try {
      toml = readFileSync("osv-scanner.toml", "utf8");
    } catch {
      /* no exceptions file */
    }
    const result = evaluate(osv, policy, firstPartyNames("."), process.cwd(), maven.aliases, maven.licenses, licenseOverrides(toml));
    const summary = renderSummary(result, policy);
    console.log(summary);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
    if (args.includes("--report-issue")) {
      const repo = process.env.GITHUB_REPOSITORY;
      const api = makeApi({ token: process.env.GITHUB_TOKEN, base: process.env.GITHUB_API_URL || "https://api.github.com" });
      const body = `${summary}\n\nUpdated by the scheduled \`security\` run on ${new Date().toISOString().slice(0, 10)} (ideal-agentic-env/governance dependency gate). Upgrade these dependencies when a fixed version exists.`;
      const r = await upsertReportIssue(api, repo, result.reported, body);
      console.log(`Report issue: ${r.action}${r.number ? ` #${r.number}` : ""}`);
      process.exit(0);
    }
    for (const f of result.blocking) console.log(`::error::${f.name}@${f.version}: ${f.finding} (${f.reason})`);
    process.exit(result.blocking.length ? 1 : 0);
  } catch (err) {
    console.error(`dependency-gate: ${err.message}`);
    process.exit(2);
  }
}
