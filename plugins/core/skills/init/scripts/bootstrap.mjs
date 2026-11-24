#!/usr/bin/env node
// One-step setup for core:init and core:plugins. It works out the plugin set (detected stacks, or what the
// user picked), installs and removes plugins through the `claude` CLI at project scope, writes core's
// scaffold, runs every chosen plugin's setup script (deterministic, add-only), and runs verify --fast.
// Setup scripts are run straight from the installed plugins, so nothing waits for a restart; the new
// plugins' skills and hooks load when Claude Code restarts.
//
//   node bootstrap.mjs [--target .] [--detect] [--add a,b] [--remove a,b] [--owner @x]
//                      [--docs-language English] [--source github|pbi] [--default-branch main]
//                      [--no-install] [--dry-run] [--json]
//
//   --detect      start from the stacks core:init detects (in addition to what the project enables)
//   --add/remove  change the plugin set; core, governance and work-github cannot be removed
//   --no-install  do not call `claude plugin install/uninstall` (print the commands instead)
// Environment: CLAUDE_BIN (the claude executable, default "claude"), CLAUDE_CONFIG_DIR.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { apply as applyScaffold, buildPlan, detect, MARKETPLACE } from "./scaffold.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = resolve(HERE, "..", "..", "..");
export const MANDATORY = ["core", "governance", "work-github"];
// The order setups run in: governance first (it creates dependabot.yml that stack setups extend).
export const OPTIONAL = ["stack-web", "stack-node", "stack-dotnet", "stack-java-spring", "stack-mobile", "data-sql", "design", "devops-selfhosted"];
const SETUP_ORDER = ["governance", "work-github", ...OPTIONAL];
const SETTINGS = ".claude/settings.json";
const CONFIG = ".claude/ideal-agentic-env.json";

const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
};
const configDir = () => process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
const key = (p) => `${p}@${MARKETPLACE}`;
const real = (p) => {
  try {
    return realpathSync(resolve(p));
  } catch {
    return resolve(p);
  }
};
const sameDir = (a, b) => Boolean(a) && real(a) === real(b);

/** Plugins of this marketplace the project enables in .claude/settings.json. */
export function enabledPlugins(root) {
  const s = readJson(join(root, SETTINGS));
  return Object.entries(s?.enabledPlugins ?? {})
    .filter(([k, v]) => v && k.endsWith(`@${MARKETPLACE}`))
    .map(([k]) => k.slice(0, -MARKETPLACE.length - 1));
}

/** The plugin set after the change: mandatory, plus enabled (and detected), plus added, minus removed. */
export function desiredPlugins(root, { detect: useDetect = false, add = [], remove = [] } = {}) {
  const unknown = [...add, ...remove].filter((p) => !MANDATORY.includes(p) && !OPTIONAL.includes(p));
  if (unknown.length) throw new Error(`unknown plugin(s): ${unknown.join(", ")}; choose from ${OPTIONAL.join(", ")}`);
  const blocked = remove.filter((p) => MANDATORY.includes(p));
  if (blocked.length) throw new Error(`${blocked.join(", ")} cannot be removed: every project needs ${MANDATORY.join(", ")}`);
  const detected = useDetect ? detect(root).stacks : [];
  const set = new Set([...MANDATORY, ...enabledPlugins(root), ...detected, ...add]);
  for (const p of remove) set.delete(p);
  return { plugins: ["core", ...SETUP_ORDER.filter((p) => set.has(p))], detected };
}

/** Where a plugin's files are: the installed copy for this project, a sibling of core (--plugin-dir or the marketplace clone), any installed copy. */
export function pluginRoot(name, root) {
  const ok = (dir) => dir && readJson(join(dir, ".claude-plugin", "plugin.json"))?.name === name;
  const registry = readJson(join(configDir(), "plugins", "installed_plugins.json"))?.plugins?.[key(name)] ?? [];
  const forProject = registry.find((e) => e.scope === "project" && sameDir(e.projectPath, root))?.installPath;
  const user = registry.find((e) => e.scope === "user")?.installPath;
  const candidates = [forProject, join(CORE_ROOT, "..", name), user, ...registry.map((e) => e.installPath), join(configDir(), "plugins", "marketplaces", MARKETPLACE, "plugins", name)];
  return candidates.find(ok) ?? null;
}

/** Plugins installed for this project (or for the user) according to Claude Code's registry. */
function installed(name, root) {
  const registry = readJson(join(configDir(), "plugins", "installed_plugins.json"))?.plugins?.[key(name)] ?? [];
  return registry.some((e) => e.scope === "user" || (e.scope === "project" && sameDir(e.projectPath, root)));
}

function claude(args, root) {
  const bin = process.env.CLAUDE_BIN || "claude";
  const r = spawnSync(bin, args, { cwd: root, encoding: "utf8", windowsHide: true, timeout: 180000, shell: process.platform === "win32" }); // nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true -- fixed plugin names from this script's own list; Windows needs a shell for claude.cmd
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim().split("\n").slice(-3).join(" ") || String(r.error?.message ?? "") };
}

// ---------- removal: the files a plugin's setup wrote that are safe to take back ----------

// The marker of a managed file (ADR-0008, shared/scaffold-lib.mjs): plugin, version and the body's hash.
const MARK_RE = /^(?:\/\/|#) Managed by ([a-z0-9-]+) (\S+) \(ideal-agentic-env\)\. .*sha256:([0-9a-f]{16})\s*$/;
function managedBy(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const i = lines.findIndex((l, n) => n < 3 && MARK_RE.test(l));
  if (i < 0) return null;
  const [, plugin, , hash] = MARK_RE.exec(lines[i]);
  lines.splice(i, 1);
  return { plugin, edited: createHash("sha256").update(lines.join("\n")).digest("hex").slice(0, 16) !== hash };
}

/** Files under .github/ that a plugin wrote as managed files: [{ rel, edited }]. */
function managedFiles(root, name) {
  const out = [];
  const visit = (rel) => {
    let entries = [];
    try {
      entries = readdirSync(join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const child = `${rel}/${e.name}`;
      if (e.isDirectory()) visit(child);
      else {
        const m = managedBy(readFileSync(join(root, child), "utf8"));
        if (m?.plugin === name) out.push({ rel: child, edited: m.edited });
      }
    }
  };
  visit(".github");
  return out;
}

/**
 * Take back what a plugin's setup wrote: its rule folder, its ci.yml blocks, the verify/format entries of its
 * stack.json and its unedited managed files. Edited managed files and Dependabot entries stay (returned as kept).
 */
export function cleanupPlugin(root, name, dir, { dryRun = false } = {}) {
  const done = [];
  const kept = [];
  for (const f of managedFiles(root, name)) {
    if (f.edited) kept.push(`${f.rel} (edited by hand)`);
    else {
      if (!dryRun) rmSync(join(root, f.rel));
      done.push(f.rel);
    }
  }
  const dependabot = existsSync(join(root, ".github", "dependabot.yml")) ? readFileSync(join(root, ".github", "dependabot.yml"), "utf8") : "";
  const eco = [].concat(dir ? readJson(join(dir, "stack.json"))?.dependabot ?? [] : []).map((d) => d.ecosystem).filter((e) => new RegExp(`package-ecosystem:\\s*["']?${e}\\b`).test(dependabot)); // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp -- ecosystem names from the plugin's own stack.json
  for (const e of eco) kept.push(`.github/dependabot.yml (${e} entry; governance owns the file, remove it by hand if nothing uses ${e})`);
  const rules = join(root, ".claude", "rules", name);
  if (existsSync(rules)) {
    if (!dryRun) rmSync(rules, { recursive: true, force: true });
    done.push(`.claude/rules/${name}/`);
  }
  const ciPath = join(root, ".github", "workflows", "ci.yml");
  if (existsSync(ciPath)) {
    const lines = readFileSync(ciPath, "utf8").split("\n");
    const out = [];
    let skipping = false;
    for (const l of lines) {
      const block = /^\s*# --- ([a-z0-9-]+)(?: \S+)?\s*$/.exec(l);
      if (block) skipping = block[1] === name;
      else if (/^\s*# <<< ideal-agentic-env:/.test(l)) skipping = false;
      if (!skipping) out.push(l);
    }
    // A services region left with only its `services:` key would be invalid YAML.
    const text = out.join("\n").replace(/(# >>> ideal-agentic-env:services[^\n]*\n)\s*services:\n(\s*# <<< ideal-agentic-env:services)/, "$1$2");
    if (text !== lines.join("\n")) {
      if (!dryRun) writeFileSync(ciPath, text);
      done.push(`.github/workflows/ci.yml (${name} blocks)`);
    }
  }
  const contract = dir ? readJson(join(dir, "stack.json")) : null;
  const cfgPath = join(root, CONFIG);
  const cfg = readJson(cfgPath);
  if (contract && cfg) {
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const theirs = [...(contract.verify?.fast ?? []), ...(contract.verify?.full ?? [])];
    let changed = false;
    for (const stage of ["fast", "full"]) {
      const before = cfg.verify?.[stage] ?? [];
      const after = before.filter((s) => !theirs.some((t) => t.name === s.name && (same(t.run, s.run) || !t.run)));
      if (after.length !== before.length) {
        cfg.verify[stage] = after;
        changed = true;
      }
    }
    const fmt = (cfg.format ?? []).filter((f) => !(contract.format ?? []).some((t) => t.run === f.run));
    if (fmt.length !== (cfg.format ?? []).length) {
      cfg.format = fmt;
      changed = true;
    }
    if (changed) {
      if (!dryRun) writeFileSync(cfgPath, `${JSON.stringify(cfg, null, 2)}\n`);
      done.push(`${CONFIG} (${name} verify and format entries)`);
    }
  }
  return { done, kept };
}

function dropFromSettings(root, names) {
  const path = join(root, SETTINGS);
  const s = readJson(path);
  if (!s?.enabledPlugins) return;
  for (const n of names) delete s.enabledPlugins[key(n)];
  writeFileSync(path, `${JSON.stringify(s, null, 2)}\n`);
}

// ---------- the run ----------

function defaultBranch(root) {
  const r = spawnSync("git", ["-C", root, "symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"], { encoding: "utf8", windowsHide: true });
  const name = r.status === 0 ? r.stdout.trim().replace(/^origin\//, "") : "";
  return /^[\w./-]+$/.test(name) ? name : "main";
}

export function bootstrap(target, opts = {}) {
  const root = resolve(target);
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error(`target is not a directory: ${target}`);
  const before = enabledPlugins(root);
  const { plugins, detected } = desiredPlugins(root, opts);
  const removing = (opts.remove ?? []).filter((p) => before.includes(p) || existsSync(join(root, ".claude", "rules", p)));
  const report = { root, dryRun: Boolean(opts.dryRun), detected, plugins, installed: [], removed: [], manual: [], setups: [], cleanup: [], kept: [], scaffold: [], verify: null };

  // 1. Core's scaffold (add-only; skips what exists, merges the plugin list into settings.json).
  const plan = buildPlan(root, { stacks: plugins.filter((p) => OPTIONAL.includes(p)), owner: opts.owner, docsLanguage: opts.docsLanguage });
  report.scaffold = plan.actions.filter((a) => a.action !== "skip").map((a) => `${a.action} ${a.rel}`);
  if (!opts.dryRun) applyScaffold(plan);
  // The pre-push hook guards this clone only once git uses .githooks (another hooks path, such as husky, stays).
  const hooksPath = spawnSync("git", ["-C", root, "config", "--get", "core.hooksPath"], { encoding: "utf8", windowsHide: true });
  if (hooksPath.status !== 0 && existsSync(join(root, ".git"))) {
    if (!opts.dryRun) spawnSync("git", ["-C", root, "config", "core.hooksPath", ".githooks"], { windowsHide: true });
    report.scaffold.push("git config core.hooksPath .githooks");
  } else if (hooksPath.status === 0 && hooksPath.stdout.trim() !== ".githooks") report.notes = [`core.hooksPath is ${hooksPath.stdout.trim()}: call .githooks/pre-push from that hook`];

  // 2. Plugins in and out, at project scope (the same as `claude plugin install … --scope project`).
  for (const p of plugins) {
    if (p === "core" || installed(p, root)) continue; // core is running this script, so it is installed
    const cmd = ["plugin", "install", key(p), "--scope", "project"];
    if (opts.dryRun || opts.noInstall) report.manual.push(`claude ${cmd.join(" ")}`);
    else {
      const r = claude(cmd, root);
      (r.ok ? report.installed : report.manual).push(r.ok ? p : `claude ${cmd.join(" ")}  (failed: ${r.out})`);
    }
  }
  for (const p of removing) {
    const c = cleanupPlugin(root, p, pluginRoot(p, root), { dryRun: opts.dryRun });
    report.cleanup.push(...c.done);
    report.kept.push(...c.kept);
    const cmd = ["plugin", "uninstall", key(p), "--scope", "project"];
    if (opts.dryRun || opts.noInstall || !installed(p, root)) {
      if (installed(p, root)) report.manual.push(`claude ${cmd.join(" ")}`);
    } else if (!claude(cmd, root).ok) report.manual.push(`claude ${cmd.join(" ")}`);
    report.removed.push(p);
  }
  if (!opts.dryRun && removing.length) dropFromSettings(root, removing);

  // 3. Every plugin's setup, straight from its installed copy (no restart needed).
  for (const p of SETUP_ORDER.filter((x) => plugins.includes(x))) {
    const dir = pluginRoot(p, root);
    const script = dir && join(dir, "skills", "setup", "scripts", "setup.mjs");
    if (!script || !existsSync(script)) {
      report.setups.push({ plugin: p, status: "not found", notes: [`${p} is not installed yet; install it, restart Claude Code and run /${p}:setup`] });
      continue;
    }
    // A dry run lists the setups: before the scaffold exists, their own dry runs would only report it missing.
    if (opts.dryRun) {
      report.setups.push({ plugin: p, status: "will run", notes: [] });
      continue;
    }
    const args = [script, "--target", root, "--json"];
    if (p === "governance") args.push("--default-branch", opts.defaultBranch ?? defaultBranch(root));
    if (p === "work-github" && opts.source) args.push("--source", opts.source);
    const r = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", windowsHide: true, timeout: 120000 });
    const out = r.status === 0 ? readJsonText(r.stdout) : null;
    if (!out) {
      report.setups.push({ plugin: p, status: "failed", notes: [String(r.stderr || r.stdout).trim().split("\n").slice(-3).join(" ")] });
      continue;
    }
    const changed = (out.actions ?? []).filter((a) => a.action !== "skip").map((a) => `${a.action} ${a.rel}`);
    report.setups.push({ plugin: p, status: "ok", profiles: out.profiles, changed, notes: out.notes ?? [] });
  }

  // 4. Prove it.
  if (!opts.dryRun && existsSync(join(root, "scripts", "verify.mjs"))) {
    const r = spawnSync(process.execPath, ["scripts/verify.mjs", "--fast"], { cwd: root, encoding: "utf8", windowsHide: true, timeout: 900000 });
    const text = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    report.verify = { ok: r.status === 0, empty: /NO CHECKS CONFIGURED/.test(text), tail: text.trim().split("\n").slice(-8).join("\n") };
  }
  return report;
}

function readJsonText(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function render(r) {
  const lines = [`${r.dryRun ? "[dry run] " : ""}target: ${r.root}`, `detected: ${r.detected.join(", ") || "(none)"}`, `plugins: ${r.plugins.join(", ")}`];
  if (r.scaffold.length) lines.push(`scaffold: ${r.scaffold.length} change(s)`, ...r.scaffold.map((s) => `  ${s}`));
  if (r.installed.length) lines.push(`installed: ${r.installed.join(", ")}`);
  if (r.removed.length) lines.push(`removed: ${r.removed.join(", ")}`, ...r.cleanup.map((c) => `  cleaned ${c}`), ...r.kept.map((k) => `  kept ${k}`));
  for (const s of r.setups) {
    lines.push(`setup ${s.plugin}: ${s.status}${s.profiles?.length ? ` (${s.profiles.join(", ")})` : ""}`);
    for (const c of s.changed ?? []) lines.push(`  ${c}`);
    for (const n of s.notes ?? []) lines.push(`  note ${n}`);
  }
  for (const n of r.notes ?? []) lines.push(`note ${n}`);
  if (r.manual.length) lines.push("run by hand:", ...r.manual.map((m) => `  ${m}`));
  if (r.verify) lines.push(`verify --fast: ${r.verify.empty ? "no checks yet" : r.verify.ok ? "green" : "RED"}`, ...r.verify.tail.split("\n").map((l) => `  ${l}`));
  if (!r.dryRun && (r.installed.length || r.removed.length)) lines.push("Restart Claude Code to load the plugins' skills and hooks.");
  return lines.join("\n");
}

function parseArgs(argv) {
  const o = { target: "." };
  const list = (v) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--target") o.target = next();
    else if (a === "--detect") o.detect = true;
    else if (a === "--add") o.add = list(next());
    else if (a === "--remove") o.remove = list(next());
    else if (a === "--owner") o.owner = next();
    else if (a === "--docs-language") o.docsLanguage = next();
    else if (a === "--source") o.source = next();
    else if (a === "--default-branch") o.defaultBranch = next();
    else if (a === "--no-install") o.noInstall = true;
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--json") o.json = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (o.owner && !/^@[\w.-]+(\/[\w.-]+)?$/.test(o.owner)) throw new Error("--owner must look like @user or @org/team");
  return o;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    const r = bootstrap(opts.target, opts);
    console.log(opts.json ? JSON.stringify(r, null, 2) : render(r));
    if (r.verify && !r.verify.ok) process.exitCode = 1;
  } catch (err) {
    console.error(`bootstrap: ${err.message}`);
    process.exit(2);
  }
}
