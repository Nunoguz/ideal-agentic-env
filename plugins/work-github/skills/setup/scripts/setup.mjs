#!/usr/bin/env node
// Scaffolds the work-github files into a project (work-github:setup). It is add-only.
//
//   node setup.mjs [--target <dir>] [--dry-run] [--json] [--source github|pbi]
//
// It creates .github/ISSUE_TEMPLATE/work-item.yml and docs/pbi/README.md, and records the default
// work source in .claude/ideal-agentic-env.json under "work" (only if that key is missing).
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { apply, isMain, parseArgs, planJsonMerge, planTemplates, report } from "./scaffold-lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = join(HERE, "..", "templates");
export const SOURCES = ["github", "pbi"];

/** "github" when origin points at GitHub, otherwise "pbi". */
export function detectSource(root) {
  const r = spawnSync("git", ["-C", root, "remote", "get-url", "origin"], { encoding: "utf8", windowsHide: true });
  return r.status === 0 && /github\.com[:/]/i.test(r.stdout) ? "github" : "pbi";
}

export function buildPlan(target, opts = {}) {
  const root = resolve(target);
  const source = opts.source ?? detectSource(root);
  if (!SOURCES.includes(source)) throw new Error(`--source must be one of ${SOURCES.join(", ")}`);
  const actions = [
    ...planTemplates(root, TEMPLATES),
    planJsonMerge(root, ".claude/ideal-agentic-env.json", { work: { source } }),
  ];
  return { root, source, actions };
}

if (isMain(import.meta.url)) {
  try {
    const opts = parseArgs(process.argv.slice(2), { "--target": "string", "--dry-run": "boolean", "--json": "boolean", "--source": "string" });
    const target = opts.target ?? ".";
    if (!existsSync(target) || !statSync(target).isDirectory()) throw new Error(`target is not a directory: ${target}`);
    const plan = buildPlan(target, opts);
    if (!opts.dryRun) apply(plan.root, plan.actions);
    console.log(report(plan.actions, { dryRun: Boolean(opts.dryRun), json: Boolean(opts.json), root: plan.root, extra: { source: plan.source } }));
  } catch (err) {
    console.error(`work-github setup: ${err.message}`);
    process.exit(1);
  }
}
