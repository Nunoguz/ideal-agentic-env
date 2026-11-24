#!/usr/bin/env node
// <plugin>:setup — wires this plugin's stack contract (stack.json, ADR-0006) into a project, add-only:
// path-scoped rules for the detected profiles, formatter and verify entries in
// .claude/ideal-agentic-env.json, a Dependabot entry, and the plugin's setup templates.
// Shared file: the source of truth is shared/stack-setup.mjs in the marketplace repo (npm run sync).
//
//   node setup.mjs [--target <dir>] [--dry-run] [--json] [--refresh] [--adopt a,b] [--print <path>] [--profiles a,b]
//
//   --refresh   update the rule files and managed CI scripts this plugin wrote, where they are unedited
//   --adopt     also replace these managed paths although setup cannot prove they are unedited (ADR-0008)
//   --print     print what setup would write to <path> (to compare with the project's copy), write nothing
//   --profiles  use these profiles instead of detecting them
import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { apply, isMain, parseArgs, proposed, readText, report } from "./scaffold-lib.mjs";
import { buildStackPlan } from "./stack-lib.mjs";

export const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export function loadPlugin(pluginRoot = PLUGIN_ROOT) {
  const plugin = JSON.parse(readText(join(pluginRoot, ".claude-plugin", "plugin.json")));
  const contract = JSON.parse(readText(join(pluginRoot, "stack.json")));
  return { plugin, contract };
}

if (isMain(import.meta.url)) {
  let name = "stack";
  try {
    const opts = parseArgs(process.argv.slice(2), {
      "--target": "string",
      "--dry-run": "boolean",
      "--json": "boolean",
      "--refresh": "boolean",
      "--adopt": "list",
      "--print": "string",
      "--profiles": "list",
    });
    const { plugin, contract } = loadPlugin();
    name = plugin.name;
    const target = opts.target ?? ".";
    if (!existsSync(target) || !statSync(target).isDirectory()) throw new Error(`target is not a directory: ${target}`);
    if (opts.print) {
      const plan = buildStackPlan(PLUGIN_ROOT, plugin, contract, target, { ...opts, refresh: true, adopt: [opts.print] });
      process.stdout.write(proposed(plan.root, plan.actions, opts.print));
      process.exit(0);
    }
    const plan = buildStackPlan(PLUGIN_ROOT, plugin, contract, target, opts);
    if (!opts.dryRun) apply(plan.root, plan.actions);
    const profiles = plan.profiles.length ? plan.profiles : ["(none)"];
    const extra = opts.json ? { plugin: plugin.name, profiles: plan.profiles, notes: plan.notes } : { plugin: `${plugin.name} ${plugin.version}`, profiles };
    console.log(report(plan.actions, { dryRun: Boolean(opts.dryRun), json: Boolean(opts.json), root: plan.root, extra }));
    if (!opts.json) for (const n of plan.notes) console.log(`  note   ${n}`);
  } catch (err) {
    console.error(`${name} setup: ${err.message}`);
    process.exit(1);
  }
}
