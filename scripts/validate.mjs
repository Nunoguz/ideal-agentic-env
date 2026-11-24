#!/usr/bin/env node
// Structural validator for this marketplace. Zero dependencies (Node >= 20).
// Complements, not replaces, the official `claude plugin validate` (run in CI):
// it also enforces this repo's own conventions (README/CHANGELOG, name parity, no orphans).

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkPins } from "./pins.mjs";
import { checkShared } from "./shared.mjs";

const NAME_RE = /^[a-z0-9][a-z0-9._-]*$/;
const KEBAB_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const RESERVED_MARKETPLACE = new Set([
  "claude-plugins-official",
  "anthropic-marketplace",
  "claude-code-plugins",
  "life-sciences",
]);
const RESERVED_PLUGIN_EXACT = new Set(["claude", "anthropic", "claude-code", "claude-mods"]);
const RESERVED_PLUGIN_PREFIX = ["claude-", "anthropic-", "anthropics-", "cc-plugin-"];
const MAX_SKILL_DESCRIPTION = 1024;
// Always-on context budget (docs/PLAN.md §7). Every session of every project that enables a plugin pays
// for the name and description of each model-invocable skill and each agent; core also injects the
// constitution. ~4 characters per token. Raising a limit needs a justification in the PR.
export const MAX_ALWAYS_ON_TOKENS = 900;
export const MAX_CONSTITUTION_TOKENS = 1000;
const STACK_SKILLS = ["setup", "scaffold", "test", "upgrade-deps"];
// The cloud plugin contract (docs/YENI-BULUT-EKLEME.md, templates/cloud-plugin/).
const CLOUD_SKILLS = ["setup", "deploy", "secrets", "iac", "observability", "cost-guard"];
const ECOSYSTEMS = ["npm", "dotnet", "jvm"];
const CI_KINDS = ["services", "steps", "after"];
const tokens = (chars) => Math.ceil(chars / 4);

export function validateRepo(root) {
  const errors = [];
  const warnings = [];
  const budget = {};
  const err = (where, msg) => errors.push(`${where}: ${msg}`);
  const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

  const mpPath = join(root, ".claude-plugin", "marketplace.json");
  const mp = readJson(mpPath, err);
  if (!mp) return { errors, warnings };

  const MP = ".claude-plugin/marketplace.json";
  if (typeof mp.name !== "string" || !NAME_RE.test(mp.name)) err(MP, "name missing or invalid");
  else if (RESERVED_MARKETPLACE.has(mp.name) || mp.name.startsWith("claudeai-"))
    err(MP, `name "${mp.name}" is reserved`);
  if (!mp.owner || typeof mp.owner.name !== "string") err(MP, "owner.name is required");
  if (!mp.description) warn(MP, "description is missing");
  if (!Array.isArray(mp.plugins)) {
    err(MP, "plugins must be an array");
    return { errors, warnings };
  }

  const seen = new Set();
  const listedDirs = new Set();
  mp.plugins.forEach((entry, i) => {
    const where = `${MP} plugins[${i}]${entry?.name ? ` (${entry.name})` : ""}`;
    validateEntry(root, entry, where, { err, warn, seen, listedDirs, budget });
  });

  const pluginsDir = join(root, "plugins");
  if (existsSync(pluginsDir)) {
    for (const dir of readdirSync(pluginsDir)) {
      if (!statSync(join(pluginsDir, dir)).isDirectory()) continue;
      if (!listedDirs.has(dir)) err(`plugins/${dir}`, "directory is not listed in marketplace.json");
    }
  }

  for (const e of checkShared(root)) errors.push(e);
  validateActionPins(root, err);
  for (const e of checkPins(root)) errors.push(e);

  return { errors, warnings, budget };
}

function validateEntry(root, entry, where, ctx) {
  const { err, warn, seen, listedDirs, budget } = ctx;
  if (!entry || typeof entry !== "object") return err(where, "entry must be an object");

  const { name, source } = entry;
  if (typeof name !== "string" || !KEBAB_RE.test(name)) err(where, "name must be kebab-case");
  else {
    if (RESERVED_PLUGIN_EXACT.has(name) || RESERVED_PLUGIN_PREFIX.some((p) => name.startsWith(p)))
      err(where, `name "${name}" is reserved`);
    if (seen.has(name)) err(where, `duplicate plugin name "${name}"`);
    seen.add(name);
  }
  if (!entry.description) warn(where, "description is missing");

  if (typeof source !== "string") return warn(where, "non-relative source; skipping local checks");
  if (!source.startsWith("./") || source.split("/").includes(".."))
    return err(where, `source "${source}" must start with ./ and must not contain ..`);

  const dir = resolve(root, source);
  if (!existsSync(dir)) return err(where, `source directory ${source} does not exist`);
  if (source.startsWith("./plugins/")) listedDirs.add(source.slice("./plugins/".length));

  const rel = source.slice(2);
  const manifest = readJson(join(dir, ".claude-plugin", "plugin.json"), err);
  if (!manifest) return;

  const mWhere = `${rel}/.claude-plugin/plugin.json`;
  if (manifest.name !== name) err(mWhere, `name "${manifest.name}" must equal marketplace entry name "${name}"`);
  if (entry.version !== undefined && manifest.version !== undefined)
    err(where, "version is set in both marketplace entry and plugin.json; keep it only in plugin.json");
  if (manifest.version === undefined) err(mWhere, "version is required by repo convention");
  else if (!SEMVER_RE.test(manifest.version)) err(mWhere, `version "${manifest.version}" is not semver`);
  if (!manifest.description) err(mWhere, "description is required by repo convention");

  for (const f of ["README.md", "CHANGELOG.md"]) {
    if (!existsSync(join(dir, f))) err(rel, `${f} is required`);
  }
  const changelog = join(dir, "CHANGELOG.md");
  if (manifest.version && existsSync(changelog)) {
    const text = readFileSync(changelog, "utf8");
    if (!text.includes(`## ${manifest.version}`))
      err(`${rel}/CHANGELOG.md`, `no "## ${manifest.version}" section for the current version`);
  }
  // Maturity (ADR-0012): 0.x is experimental and says so where people choose plugins; 1.x is stable.
  if (manifest.version && SEMVER_RE.test(manifest.version)) {
    const experimental = manifest.version.startsWith("0.");
    const tagged = /^\[experimental\]/.test(entry.description ?? "");
    const readme = existsSync(join(dir, "README.md")) ? readFileSync(join(dir, "README.md"), "utf8") : "";
    const status = (readme.match(/^> \*\*(?:Durum|Status):\*\*.*$/m) ?? [""])[0];
    if (experimental && !tagged) err(where, `version ${manifest.version} is experimental (ADR-0012): start the description with "[experimental]"`);
    if (experimental && !/Deneysel|Experimental/.test(status)) err(`${rel}/README.md`, 'an experimental plugin needs a "> **Status:** Experimental, ..." line (ADR-0012)');
    if (!experimental && tagged) err(where, `version ${manifest.version} is stable (ADR-0012): drop "[experimental]" or go back to 0.x`);
    if (!experimental && !/Stabil|Stable/.test(status)) err(`${rel}/README.md`, 'a stable plugin needs a "> **Status:** Stable, ..." line (ADR-0012)');
  }
  if (existsSync(join(dir, "CLAUDE.md")))
    err(rel, "CLAUDE.md in a plugin root is never loaded; move instructions into a skill");

  validateHooks(dir, rel, err, warn);
  validateSkills(dir, rel, err);
  validateAgents(dir, rel, err);
  validateStackContract(dir, rel, name, manifest.version, err);
  validateCloudContract(dir, rel, name, manifest.version, err);
  if (typeof name === "string") budget[name] = validateBudget(dir, rel, err);
}

/** Always-on tokens: model-invocable skills and agents (name + description), plus core's constitution. */
export function alwaysOnCost(dir) {
  let chars = 0;
  const skillsDir = join(dir, "skills");
  if (existsSync(skillsDir)) {
    for (const skill of readdirSync(skillsDir)) {
      const file = join(skillsDir, skill, "SKILL.md");
      if (!existsSync(file)) continue;
      const fm = frontmatter(readFileSync(file, "utf8")) ?? {};
      if (fm["disable-model-invocation"] === "true") continue;
      chars += (fm.name ?? "").length + (fm.description ?? "").length;
    }
  }
  const agentsDir = join(dir, "agents");
  if (existsSync(agentsDir)) {
    for (const f of readdirSync(agentsDir).filter((x) => x.endsWith(".md"))) {
      const fm = frontmatter(readFileSync(join(agentsDir, f), "utf8")) ?? {};
      chars += (fm.name ?? "").length + (fm.description ?? "").length;
    }
  }
  const constitution = join(dir, "constitution.md");
  return { descriptions: tokens(chars), constitution: existsSync(constitution) ? tokens(readFileSync(constitution, "utf8").length) : 0 };
}

function validateBudget(dir, rel, err) {
  const cost = alwaysOnCost(dir);
  if (cost.descriptions > MAX_ALWAYS_ON_TOKENS)
    err(rel, `always-on skill and agent descriptions cost ~${cost.descriptions} tokens (limit ${MAX_ALWAYS_ON_TOKENS}); shorten descriptions or mark user-only skills disable-model-invocation`);
  if (cost.constitution > MAX_CONSTITUTION_TOKENS) err(`${rel}/constitution.md`, `~${cost.constitution} tokens (limit ${MAX_CONSTITUTION_TOKENS})`);
  return cost;
}

// The stack contract (ADR-0006): <plugin>/stack.json, applied by the shared setup script.
// Skeleton plugins (0.0.x, nothing shipped yet) are exempt until their first real release.
function validateStackContract(dir, rel, name, version, err) {
  const isStack = typeof name === "string" && name.startsWith("stack-") && !String(version).startsWith("0.0.");
  const file = join(dir, "stack.json");
  if (!existsSync(file)) {
    if (isStack) err(rel, "stack plugins need a stack.json contract (ADR-0006)");
    return;
  }
  const where = `${rel}/stack.json`;
  const c = readJson(file, err);
  if (!c) return;
  const profiles = Object.entries(c.profiles ?? {});
  if (!profiles.length) err(where, "profiles must be a non-empty object");
  else if (profiles.every(([, p]) => p?.companion)) err(where, "at least one profile must not be a companion, or none ever applies");
  if (c.ecosystem !== undefined && !ECOSYSTEMS.includes(c.ecosystem)) err(where, `ecosystem must be one of ${ECOSYSTEMS.join(", ")}`);
  const used = new Set();
  for (const [p, prof] of profiles) {
    const pw = `${where} profiles.${p}`;
    if (!prof || typeof prof !== "object") {
      err(pw, "must be an object");
      continue;
    }
    if (prof.scope !== undefined && !["package", "repo"].includes(prof.scope)) err(pw, 'scope must be "package" or "repo"');
    if (prof.ecosystem !== undefined && !ECOSYSTEMS.includes(prof.ecosystem)) err(pw, `ecosystem must be one of ${ECOSYSTEMS.join(", ")}`);
    if (prof.companion !== undefined && typeof prof.companion !== "boolean") err(pw, "companion must be true or false");
    if (!Array.isArray(prof.paths) || prof.paths.some((g) => typeof g !== "string")) err(pw, "paths must be an array of globs");
    if (!Array.isArray(prof.rules)) err(pw, "rules must be an array");
    for (const r of prof.rules ?? []) {
      used.add(r);
      if (!existsSync(join(dir, "rules", r))) err(pw, `rule rules/${r} does not exist`);
    }
    if ((prof.rules ?? []).length && !(prof.paths ?? []).length) err(pw, "a profile with rules needs paths, or its rules never load");
  }
  if (existsSync(join(dir, "rules")))
    for (const r of readdirSync(join(dir, "rules")).filter((f) => f.endsWith(".md"))) if (!used.has(r)) err(`${rel}/rules/${r}`, "not used by any profile in stack.json");
  for (const f of c.format ?? []) if (typeof f?.glob !== "string" || typeof f?.run !== "string" || !f.run.includes("{file}")) err(where, "format entries need glob and a run command containing {file}");
  for (const stage of ["fast", "full"])
    for (const s of c.verify?.[stage] ?? []) {
      const platformRun = s?.run && typeof s.run === "object" && typeof s.run.posix === "string" && typeof s.run.win32 === "string";
      if (typeof s?.name !== "string" || (typeof s.run !== "string" && !platformRun && typeof s.script !== "string")) err(where, `verify.${stage} entries need name and run (a string or { posix, win32 }) or script`);
    }
  for (const d of Array.isArray(c.dependabot) ? c.dependabot : c.dependabot ? [c.dependabot] : [])
    if (typeof d?.ecosystem !== "string" || !Array.isArray(d.lockfiles)) err(where, "dependabot entries need ecosystem and lockfiles");
  if (c.templates && !existsSync(join(dir, "skills", "setup", "templates"))) err(where, "templates is set but skills/setup/templates/ does not exist");
  validateCiFragments(dir, rel, where, c.ci, err);
  for (const h of c.hints ?? []) if (typeof h?.note !== "string" || !h.when || typeof h.when !== "object") err(where, "hints entries need when (a condition) and note");

  const setup = join(dir, "skills", "setup", "SKILL.md");
  if (!existsSync(setup)) err(rel, "a plugin with stack.json needs skills/setup");
  else if (frontmatter(readFileSync(setup, "utf8"))?.["disable-model-invocation"] !== "true") err(`${rel}/skills/setup/SKILL.md`, "setup changes the project; set disable-model-invocation: true");
  if (!existsSync(join(dir, "skills", "setup", "scripts", "setup.mjs"))) err(rel, "skills/setup/scripts/setup.mjs is missing; list it in shared/manifest.json and run npm run sync");
  if (isStack) {
    for (const s of STACK_SKILLS) if (!existsSync(join(dir, "skills", s, "SKILL.md"))) err(rel, `stack plugins need the ${s} skill (ADR-0006)`);
    if (!existsSync(join(dir, ".lsp.json"))) err(rel, "stack plugins need a .lsp.json (ADR-0006)");
    if (typeof c.lsp?.binary !== "string") err(where, "stack plugins declare lsp.binary so setup can check it");
  }
}

// A released cloud-* plugin ships the five cloud skills and guards its provider's destructive commands.
function validateCloudContract(dir, rel, name, version, err) {
  if (typeof name !== "string" || !name.startsWith("cloud-") || String(version).startsWith("0.0.")) return;
  for (const s of CLOUD_SKILLS) if (!existsSync(join(dir, "skills", s, "SKILL.md"))) err(rel, `cloud plugins need the ${s} skill (docs/YENI-BULUT-EKLEME.md)`);
  let contract = null;
  try {
    contract = JSON.parse(readFileSync(join(dir, "stack.json"), "utf8"));
  } catch {
    return err(rel, "cloud plugins need a stack.json with the guarded commands");
  }
  const guards = contract?.config?.guardedCommands;
  if (!Array.isArray(guards) || !guards.length) return err(`${rel}/stack.json`, "a released cloud plugin lists its provider's destructive commands in config.guardedCommands");
  for (const g of guards) {
    if (typeof g?.pattern !== "string" || !["ask", "deny"].includes(g?.decision) || typeof g?.reason !== "string") err(`${rel}/stack.json`, "guardedCommands entries need pattern, decision (ask or deny) and reason");
    else
      try {
        new RegExp(g.pattern, "i"); // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp -- validating a repo-owned pattern
      } catch {
        err(`${rel}/stack.json`, `guardedCommands pattern ${g.pattern} is not a valid regular expression`);
      }
  }
}

// CI fragments (ADR-0010) are shipped workflow content: actions pinned to a SHA (checked with the
// workflows) and container images pinned to a digest, because a tag can be repointed too.
export function unpinnedImages(text) {
  return text
    .split(/\r?\n/)
    .map((line, i) => ({ image: /^\s*image:\s*["']?([^"'\s#]+)/.exec(line)?.[1], line: i + 1 }))
    .filter(({ image }) => image && !/@sha256:[0-9a-f]{64}$/.test(image));
}

function validateCiFragments(dir, rel, where, ci, err) {
  if (ci === undefined) return;
  if (!ci || typeof ci !== "object" || Array.isArray(ci)) return err(where, "ci must be an object");
  for (const [kind, entries] of Object.entries(ci)) {
    if (!CI_KINDS.includes(kind)) {
      err(where, `ci.${kind} is unknown; use ${CI_KINDS.join(", ")}`);
      continue;
    }
    for (const e of Array.isArray(entries) ? entries : []) {
      if (typeof e?.file !== "string" || !e.file.startsWith("ci/") || !e.file.endsWith(".yml")) {
        err(where, `ci.${kind} entries need a file under ci/ ending in .yml`);
        continue;
      }
      const path = join(dir, e.file);
      if (!existsSync(path)) {
        err(where, `ci.${kind}: ${e.file} does not exist`);
        continue;
      }
      const text = readFileSync(path, "utf8");
      if (kind === "services" && !/^[A-Za-z0-9_-]+:\s*$/m.test(text.split(/\r?\n/).find((l) => l && !l.startsWith("#")) ?? "")) err(`${rel}/${e.file}`, "a services fragment starts with the service name (name:)");
      if (kind !== "services" && !/^- /m.test(text)) err(`${rel}/${e.file}`, "a steps fragment is a list of steps (- uses: / - run:)");
      for (const { image, line } of unpinnedImages(text)) err(`${rel}/${e.file}:${line}`, `image "${image}" is not pinned to a sha256 digest`);
    }
  }
}

// Tags and branches can be repointed by an action's owner, so every `uses:` in this repo's workflows and
// in the workflow templates we ship is pinned to a full commit SHA (Dependabot keeps the pins current).
const USES_RE = /^\s*-?\s*uses:\s*["']?([^"'\s#]+)/;
export function unpinnedActions(text) {
  return text
    .split(/\r?\n/)
    .map((line, i) => ({ ref: USES_RE.exec(line)?.[1], line: i + 1 }))
    .filter(({ ref }) => ref && !ref.startsWith("./") && !ref.startsWith("docker://") && !/@[0-9a-f]{40}$/.test(ref));
}

function workflowFiles(root) {
  const out = [];
  const wf = join(root, ".github", "workflows");
  if (existsSync(wf)) for (const f of readdirSync(wf)) if (/\.ya?ml$/.test(f)) out.push(join(".github", "workflows", f));
  const visit = (rel) => {
    for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
      const child = join(rel, e.name);
      if (e.isDirectory()) visit(child);
      else if ((/\.ya?ml\.tmpl$/.test(e.name) && /[\\/]workflows[\\/]/.test(child)) || (/\.ya?ml$/.test(e.name) && /^plugins[\\/][^\\/]+[\\/]ci[\\/]/.test(child))) out.push(child);
    }
  };
  if (existsSync(join(root, "plugins"))) visit("plugins");
  return out;
}

function validateActionPins(root, err) {
  for (const rel of workflowFiles(root)) {
    for (const { ref, line } of unpinnedActions(readFileSync(join(root, rel), "utf8")))
      err(`${rel.replace(/\\/g, "/")}:${line}`, `action "${ref}" is not pinned to a full commit SHA`);
  }
}

function validateHooks(dir, rel, err, warn) {
  const p = join(dir, "hooks", "hooks.json");
  if (!existsSync(p)) return;
  const hooks = readJson(p, err);
  if (!hooks) return;
  const where = `${rel}/hooks/hooks.json`;
  if (!hooks.hooks || typeof hooks.hooks !== "object")
    return err(where, 'must wrap the event map in a top-level "hooks" key');
  for (const [event, groups] of Object.entries(hooks.hooks)) {
    if (!Array.isArray(groups)) {
      err(where, `${event} must be an array`);
      continue;
    }
    for (const group of groups) {
      for (const h of group.hooks ?? []) {
        if (h.type === "command" && typeof h.command === "string") {
          if (/(^|[^"])\$\{CLAUDE_PLUGIN_ROOT\}/.test(h.command))
            warn(where, `${event}: quote \${CLAUDE_PLUGIN_ROOT} in shell-form commands`);
        }
      }
    }
  }
}

function validateSkills(dir, rel, err) {
  const skillsDir = join(dir, "skills");
  if (!existsSync(skillsDir)) return;
  for (const skill of readdirSync(skillsDir)) {
    const skillDir = join(skillsDir, skill);
    if (!statSync(skillDir).isDirectory()) continue;
    const where = `${rel}/skills/${skill}/SKILL.md`;
    const file = join(skillDir, "SKILL.md");
    if (!existsSync(file)) {
      err(where, "missing");
      continue;
    }
    const fm = frontmatter(readFileSync(file, "utf8"));
    if (!fm) {
      err(where, "missing YAML frontmatter");
      continue;
    }
    if (fm.name !== skill) err(where, `frontmatter name "${fm.name}" must equal directory "${skill}"`);
    if (!fm.description) err(where, "frontmatter description is required");
    else if (fm.description.length > MAX_SKILL_DESCRIPTION)
      err(where, `description exceeds ${MAX_SKILL_DESCRIPTION} characters`);
    yamlScalarRisk(fm, where, err);
  }
}

function validateAgents(dir, rel, err) {
  const agentsDir = join(dir, "agents");
  if (!existsSync(agentsDir)) return;
  for (const file of readdirSync(agentsDir).filter((f) => f.endsWith(".md"))) {
    const where = `${rel}/agents/${file}`;
    const fm = frontmatter(readFileSync(join(agentsDir, file), "utf8"));
    if (!fm) {
      err(where, "missing YAML frontmatter");
      continue;
    }
    if (fm.name !== file.replace(/\.md$/, "")) err(where, "frontmatter name must equal file name");
    if (!fm.description) err(where, "frontmatter description is required");
    yamlScalarRisk(fm, where, err);
  }
}

// In an unquoted YAML value " #" starts a comment (the rest is silently dropped) and ": " is a syntax
// error. Our minimal reader would not notice, but Claude Code's YAML parser would.
function yamlScalarRisk(fm, where, err) {
  for (const [key, value] of Object.entries(fm.__raw ?? {})) {
    if (/^["']/.test(value)) continue;
    if (/\s#/.test(value)) err(where, `${key}: unquoted " #" starts a YAML comment and cuts the value; rephrase or quote it`);
    else if (/:\s/.test(value)) err(where, `${key}: unquoted ": " is invalid YAML; rephrase or quote it`);
  }
}

// Minimal frontmatter reader: top-level `key: value` pairs, quoted or plain, single line.
export function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return null;
  const out = {};
  const raw = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    raw[kv[1]] = kv[2];
    out[kv[1]] = kv[2].replace(/^(["'])(.*)\1$/, "$2").trim();
  }
  Object.defineProperty(out, "__raw", { value: raw, enumerable: false });
  return out;
}

function readJson(path, err) {
  if (!existsSync(path)) {
    err(path, "file not found");
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    err(path, `invalid JSON (${e.message})`);
    return null;
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = resolve(process.argv[2] ?? join(fileURLToPath(import.meta.url), "..", ".."));
  const { errors, warnings, budget } = validateRepo(root);
  const cost = Object.entries(budget)
    .filter(([, c]) => c.descriptions || c.constitution)
    .map(([n, c]) => `${n} ${c.descriptions}${c.constitution ? `+${c.constitution}` : ""}`);
  console.log(`always-on tokens (descriptions[+constitution], limit ${MAX_ALWAYS_ON_TOKENS}): ${cost.join(", ")}`);
  for (const w of warnings) console.warn(`warning  ${w}`);
  for (const e of errors) console.error(`error    ${e}`);
  console.log(errors.length ? `\nValidation failed: ${errors.length} error(s), ${warnings.length} warning(s)` : `Validation passed (${warnings.length} warning(s))`);
  process.exit(errors.length ? 1 : 0);
}
