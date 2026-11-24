#!/usr/bin/env node
// Scaffolds the governance layer into a project (governance:setup). Records under docs/ and
// .github/dependabot.yml belong to the project: setup creates them once and never overwrites them. The CI
// scripts and workflows are managed (ADR-0008): `--refresh` updates them while they are unedited.
//
//   node setup.mjs [--target <dir>] [--dry-run] [--json] [--parts docs,ci] [--default-branch main]
//                  [--refresh] [--adopt a,b] [--print <path>]
//
//   docs     docs/compliance/* and docs/security/* (records the governance skills maintain)
//   ci       .github/workflows/{security,compliance,change-audit}.yml, .github/scripts/*, .github/dependabot.yml,
//            and the dependency policy in .claude/ideal-agentic-env.json (governance.licenses, governance.vulnerabilities)
//   --refresh  update managed files that are unedited since setup wrote them
//   --adopt    also replace these managed paths (an unmarked copy from an older release, or a hand-edited one)
//   --print    print what setup would write to <path>, write nothing
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { apply, isMain, parseArgs, planTemplates, proposed, readText, report } from "./scaffold-lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = join(HERE, "..", "templates");
const PLUGIN_ROOT = join(HERE, "..", "..", "..");
const PII_RULES = join(PLUGIN_ROOT, "hooks", "lib", "pii-rules.mjs");
const PARTS = { docs: (rel) => rel.startsWith("docs/"), ci: (rel) => rel.startsWith(".github/") };
const CONFIG = ".claude/ideal-agentic-env.json";

// SPDX identifiers allowed for third-party dependencies. Changing the project's list is a legal decision.
// MIT-0 and PostgreSQL were added on 2026-11-23 by the repository owner (CSS tooling and Npgsql, ADR-0009).
export const DEFAULT_LICENSES = ["MIT", "MIT-0", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "0BSD", "Unlicense", "CC0-1.0", "Zlib", "BlueOak-1.0.0", "Python-2.0", "MPL-2.0", "PostgreSQL"];
// ADR-0009: CVSS 7.0 (High) and above blocks; malicious packages and findings without a severity always block.
export const DEFAULT_BLOCK_AT = 7;

export function defaultBranch(root) {
  const r = spawnSync("git", ["-C", root, "symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"], { encoding: "utf8", windowsHide: true });
  const name = r.status === 0 ? r.stdout.trim().replace(/^origin\//, "") : "";
  return /^[\w./-]+$/.test(name) ? name : "main";
}

export function pluginInfo() {
  const { name, version } = JSON.parse(readText(join(PLUGIN_ROOT, ".claude-plugin", "plugin.json")));
  return { name, version };
}

/** The license allowlist an older security.yml kept in its LICENSE_ALLOWLIST env (governance <= 0.1.3). */
export function legacyAllowlist(root) {
  const m = /^\s*LICENSE_ALLOWLIST:\s*["']?([^"'\n]+)["']?\s*$/m.exec(readText(join(root, ".github", "workflows", "security.yml")));
  return m ? m[1].split(",").map((s) => s.trim()).filter(Boolean) : null;
}

/** Add the dependency policy to the project config, add-only. An older workflow's allowlist moves over unchanged. */
export function planPolicy(root) {
  const text = readText(join(root, CONFIG));
  if (!text) return { rel: CONFIG, action: "skip", note: "missing; run /core:init first. The dependency gate reads its policy from this file and fails without it" };
  let cfg;
  try {
    cfg = JSON.parse(text);
  } catch {
    return { rel: CONFIG, action: "skip", note: "not valid JSON; fix it, then re-run" };
  }
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) return { rel: CONFIG, action: "skip", note: "not a JSON object" };
  if ("governance" in cfg && (typeof cfg.governance !== "object" || Array.isArray(cfg.governance) || cfg.governance === null))
    return { rel: CONFIG, action: "skip", note: "governance is not an object; fix it, then re-run" };
  const gov = { ...(cfg.governance ?? {}) };
  const added = [];
  if (!Array.isArray(gov.licenses?.allow)) {
    const legacy = legacyAllowlist(root);
    gov.licenses = { ...(gov.licenses ?? {}), allow: legacy ?? DEFAULT_LICENSES };
    added.push(`governance.licenses.allow${legacy ? " (moved from security.yml)" : ""}`);
  }
  if (typeof gov.vulnerabilities?.blockAtOrAbove !== "number") {
    gov.vulnerabilities = { ...(gov.vulnerabilities ?? {}), blockAtOrAbove: DEFAULT_BLOCK_AT };
    added.push("governance.vulnerabilities.blockAtOrAbove");
  }
  if (!added.length) return { rel: CONFIG, action: "skip", note: "dependency policy already configured" };
  return { rel: CONFIG, action: "merge", note: `adds ${added.join(", ")}`, content: `${JSON.stringify({ ...cfg, governance: gov }, null, 2)}\n` };
}

export function buildPlan(target, opts = {}) {
  const root = resolve(target);
  const parts = opts.parts?.length ? opts.parts : Object.keys(PARTS);
  const unknown = parts.filter((p) => !PARTS[p]);
  if (unknown.length) throw new Error(`unknown part(s): ${unknown.join(", ")}; use ${Object.keys(PARTS).join(", ")}`);
  const branch = opts.defaultBranch ?? defaultBranch(root);
  if (!/^[\w./-]+$/.test(branch)) throw new Error(`invalid branch name: ${branch}`);
  const vars = { DEFAULT_BRANCH: branch, PII_RULES: readText(PII_RULES).trimEnd() };
  const plugin = opts.plugin ?? pluginInfo();
  const actions = planTemplates(root, TEMPLATES, vars, (rel) => parts.some((p) => PARTS[p](rel)), { plugin, refresh: opts.refresh, adopt: opts.adopt ?? [] });
  if (parts.includes("ci")) actions.push(planPolicy(root));
  return { root, parts, defaultBranch: branch, actions };
}

if (isMain(import.meta.url)) {
  try {
    const opts = parseArgs(process.argv.slice(2), {
      "--target": "string",
      "--dry-run": "boolean",
      "--json": "boolean",
      "--parts": "list",
      "--default-branch": "string",
      "--refresh": "boolean",
      "--adopt": "list",
      "--print": "string",
    });
    const target = opts.target ?? ".";
    if (!existsSync(target) || !statSync(target).isDirectory()) throw new Error(`target is not a directory: ${target}`);
    if (opts.print) {
      const plan = buildPlan(target, { ...opts, refresh: true, adopt: [opts.print] });
      process.stdout.write(proposed(plan.root, plan.actions, opts.print));
      process.exit(0);
    }
    const plan = buildPlan(target, opts);
    if (!opts.dryRun) apply(plan.root, plan.actions);
    console.log(report(plan.actions, { dryRun: Boolean(opts.dryRun), json: Boolean(opts.json), root: plan.root, extra: { parts: plan.parts, defaultBranch: plan.defaultBranch } }));
  } catch (err) {
    console.error(`governance setup: ${err.message}`);
    process.exit(1);
  }
}
