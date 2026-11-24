// The stack contract (ADR-0006, ADR-0010). A plugin that contributes rules, formatters, verify steps, CI
// blocks or Dependabot entries to a project describes them in <plugin>/stack.json. This library turns that
// contract into an add-only plan for one project: path-scoped rules for the profiles it detects, appended
// config entries, its blocks in the CI workflow, a Dependabot entry, and notes about what the project is
// missing (lockfile, LSP binary, scripts, solution file).
// Shared file: the source of truth is shared/stack-lib.mjs in the marketplace repo (npm run sync).

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { planTemplates, readText } from "./scaffold-lib.mjs";

export const CONFIG = ".claude/ideal-agentic-env.json";
export const DEPENDABOT = ".github/dependabot.yml";
export const CI = ".github/workflows/ci.yml";
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", ".nuxt", ".output", ".expo", "out", "coverage", "vendor", ".venv", "venv", "target", "bin", "obj", ".turbo", "Pods", ".gradle"]);
const CONFIG_LISTS = ["migrations", "migrationsMutable", "protectedPaths", "secretFiles", "guardedCommands"];
// Keys owned by core or another plugin; a stack contract may never set them as objects.
const RESERVED = new Set(["verify", "format", "work", "governance", "$comment"]);
// The ecosystem a Dependabot ecosystem's manifests belong to.
const UNIT_ECOSYSTEM = { npm: "npm", nuget: "dotnet", maven: "jvm", gradle: "jvm" };
const lf = (text) => text.replace(/\r\n/g, "\n");

// ---------- project scan ----------

/** Every file below `root` (POSIX, relative), skipping build output and dependencies. */
export function listFiles(root, depth = 6) {
  const out = [];
  const visit = (rel, d) => {
    let entries;
    try {
      entries = readdirSync(join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const child = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && d < depth) visit(child, d + 1);
      } else out.push(child);
    }
  };
  visit("", 0);
  return out;
}

function parseJson(text) {
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

const dirOf = (f) => (f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : "");

/** package.json files: { ecosystem: "npm", dir ("" for root), deps (all dependency names), scripts, workspaceRoot }. */
export function packages(root, files = listFiles(root)) {
  return files
    .filter((f) => f === "package.json" || f.endsWith("/package.json"))
    .map((f) => {
      const pkg = parseJson(readText(join(root, f))) ?? {};
      const dir = dirOf(f);
      const deps = new Set(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies }));
      const workspaceRoot = Boolean(pkg.workspaces) || existsSync(join(root, dir, "pnpm-workspace.yaml"));
      return { ecosystem: "npm", file: f, dir, deps, scripts: pkg.scripts ?? {}, workspaceRoot };
    })
    .sort((a, b) => a.dir.localeCompare(b.dir));
}

/** .NET project files: { ecosystem: "dotnet", dir, deps (PackageReference names), sdk (Project Sdk) }. */
export function dotnetProjects(root, files = listFiles(root)) {
  return files
    .filter((f) => /\.(cs|fs)proj$/.test(f))
    .map((f) => {
      const xml = readText(join(root, f));
      const deps = new Set([...xml.matchAll(/<PackageReference\b[^>]*?\b(?:Include|Update)\s*=\s*"([^"]+)"/g)].map((m) => m[1]));
      const sdk = /<Project\b[^>]*\bSdk\s*=\s*"([^"/]+)/.exec(xml)?.[1] ?? /<Sdk\b[^>]*\bName\s*=\s*"([^"/]+)/.exec(xml)?.[1] ?? "";
      return { ecosystem: "dotnet", file: f, dir: dirOf(f), deps, sdk, scripts: {}, workspaceRoot: false };
    })
    .sort((a, b) => a.file.localeCompare(b.file));
}

const xmlTag = (text, tag) => new RegExp(`<${tag}>\\s*([^<\\s]+)\\s*</${tag}>`).exec(text)?.[1]; // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp -- tag is a constant of this file

/**
 * Maven and Gradle builds: { ecosystem: "jvm", build: "maven" | "gradle", dir, deps ("groupId:artifactId") }.
 * A Maven pom lists its dependencies, parent and plugins; a Gradle build file its quoted "group:artifact"
 * coordinates, plus every library of gradle/libs.versions.toml. An aggregator (a pom with <modules>, or the
 * root build of a Gradle multi-project) is a workspace root, like an npm workspace root.
 */
export function jvmProjects(root, files = listFiles(root)) {
  const catalog = readText(join(root, "gradle", "libs.versions.toml"));
  const catalogDeps = [
    ...[...catalog.matchAll(/\bmodule\s*=\s*"([\w.-]+:[\w.-]+)"/g)].map((m) => m[1]),
    ...[...catalog.matchAll(/\bgroup\s*=\s*"([\w.-]+)"\s*,\s*name\s*=\s*"([\w.-]+)"/g)].map((m) => `${m[1]}:${m[2]}`),
  ];
  const settings = readText(join(root, "settings.gradle")) + readText(join(root, "settings.gradle.kts"));
  return files
    .filter((f) => /(^|\/)(pom\.xml|build\.gradle(\.kts)?)$/.test(f))
    .map((f) => {
      const text = readText(join(root, f)).replace(/<!--[\s\S]*?-->/g, "");
      const dir = dirOf(f);
      if (f.endsWith("pom.xml")) {
        const deps = new Set();
        for (const m of text.matchAll(/<(dependency|parent|plugin)>([\s\S]*?)<\/\1>/g)) {
          const artifact = xmlTag(m[2], "artifactId");
          const group = xmlTag(m[2], "groupId") ?? (m[1] === "plugin" ? "org.apache.maven.plugins" : "");
          if (artifact) deps.add(`${group}:${artifact}`);
        }
        return { ecosystem: "jvm", build: "maven", file: f, dir, deps, scripts: {}, workspaceRoot: /<modules>/.test(text) };
      }
      const deps = new Set([...text.matchAll(/["']([A-Za-z0-9_.-]+):([A-Za-z0-9_.-]+)(?::[^"'\s]*)?["']/g)].map((m) => `${m[1]}:${m[2]}`));
      for (const d of catalogDeps) deps.add(d);
      return { ecosystem: "jvm", build: "gradle", file: f, dir, deps, scripts: {}, workspaceRoot: dir === "" && /\binclude\b/.test(settings) };
    })
    .sort((a, b) => a.file.localeCompare(b.file));
}

/** The Java release the root build targets (pom properties, Gradle toolchain or .java-version), or null. */
export function javaVersion(root) {
  const pom = readText(join(root, "pom.xml"));
  const gradle = readText(join(root, "build.gradle.kts")) + readText(join(root, "build.gradle"));
  const v =
    /<(?:java\.version|maven\.compiler\.release)>\s*(\d+)\s*</.exec(pom)?.[1] ??
    /JavaLanguageVersion\.of\(\s*(\d+)\s*\)/.exec(gradle)?.[1] ??
    /^\s*(\d+)/.exec(readText(join(root, ".java-version")))?.[1];
  return v ?? null;
}

export function packageManager(root) {
  if (existsSync(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(root, "yarn.lock"))) return "yarn";
  return "npm";
}

/** The solution file at the repository root (`.slnx` first, the .NET 10 default), or null. */
export function solutionFile(files) {
  return files.find((f) => !f.includes("/") && f.endsWith(".slnx")) ?? files.find((f) => !f.includes("/") && f.endsWith(".sln")) ?? null;
}

const runScript = (pm, script) => (pm === "npm" ? (script === "test" ? "npm test" : `npm run ${script}`) : `${pm} ${script}`);

// ---------- globs ----------

/** `a/{b,c}/*.{ts,tsx}` → four plain globs. Not nested. */
export function expandBraces(glob) {
  const m = /\{([^{}]*)\}/.exec(glob);
  if (!m) return [glob];
  return m[1].split(",").flatMap((alt) => expandBraces(glob.slice(0, m.index) + alt + glob.slice(m.index + m[0].length)));
}

// Inverse of expandBraces for globs that differ only in their extension (src/x.css + src/x.md -> src/x.{css,md}).
export function joinGlobs(globs) {
  const parts = globs.map((g) => /^(.*\.)([^./{}*]+)$/.exec(g));
  if (parts.every(Boolean) && new Set(parts.map((p) => p[1])).size === 1)
    return parts.length === 1 ? globs[0] : `${parts[0][1]}{${parts.map((p) => p[2]).join(",")}}`;
  return globs.length === 1 ? globs[0] : `{${globs.join(",")}}`;
}

function globRe(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        const slash = glob[i + 2] === "/";
        re += slash ? "(?:.*/)?" : ".*";
        i += slash ? 2 : 1;
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, "i"); // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp -- compiled from plugin-owned stack.json globs with every metacharacter escaped
}

const anyGlob = (files, globs) => {
  const res = globs.flatMap(expandBraces).map(globRe);
  return files.some((f) => res.some((re) => re.test(f)));
};

// ---------- conditions ----------

const fileHas = (ctx, map) => Object.entries(map).every(([file, text]) => readText(join(ctx.root, file)).includes(text));
const fileLacks = (ctx, map) => Object.entries(map).every(([file, text]) => !readText(join(ctx.root, file)).includes(text));

/**
 * A condition holds when every given key holds:
 *   dependencies: [..]       some manifest has one of them (scope "package": this manifest)
 *   dependencyPrefixes: [..] some manifest has a dependency that starts with one of them
 *   notDependencies: [..]    the manifest has none of them (package scope only)
 *   sdk: [..]                a .NET project uses one of these Project Sdks (package scope: this project)
 *   files: [glob..]          some project file matches
 *   notFiles: [glob..]       no project file matches
 *   fileContains: {f: text}  every listed file contains its text
 *   notFileContains: {..}    no listed file contains its text (a missing file contains nothing)
 *   script: "name"           the root package.json has that script
 */
function holds(cond, ctx, unit) {
  if (!cond) return true;
  const units = unit ? [unit] : ctx.units;
  if (cond.dependencies && !units.some((u) => cond.dependencies.some((n) => u.deps.has(n)))) return false;
  if (cond.dependencyPrefixes && !units.some((u) => [...u.deps].some((d) => cond.dependencyPrefixes.some((p) => d.startsWith(p))))) return false;
  if (cond.notDependencies && units.some((u) => cond.notDependencies.some((n) => u.deps.has(n)))) return false;
  if (cond.sdk && !units.some((u) => cond.sdk.includes(u.sdk))) return false;
  if (cond.files && !anyGlob(ctx.files, cond.files)) return false;
  if (cond.notFiles && anyGlob(ctx.files, cond.notFiles)) return false;
  if (cond.fileContains && !fileHas(ctx, cond.fileContains)) return false;
  if (cond.notFileContains && !fileLacks(ctx, cond.notFileContains)) return false;
  if (cond.script && !ctx.rootPkg?.scripts?.[cond.script]) return false;
  return true;
}

const anyOf = (detect, ctx, unit) => (Array.isArray(detect) ? detect : [detect]).some((c) => holds(c, ctx, unit));

// ---------- planning ----------

export function contextFor(target) {
  const root = resolve(target);
  const files = listFiles(root);
  const pkgs = packages(root, files);
  const units = [...pkgs, ...dotnetProjects(root, files), ...jvmProjects(root, files)];
  return { root, files, pkgs, units, rootPkg: pkgs.find((p) => p.dir === ""), pm: packageManager(root), solution: solutionFile(files), javaVersion: javaVersion(root) };
}

/**
 * Profiles the project uses, each with the path globs its rules load for. A profile with
 * `"scope": "package"` (the default) is detected per manifest of its `ecosystem` (default "npm":
 * package.json; "dotnet": *.csproj; "jvm": pom.xml and build.gradle(.kts)) and its paths are prefixed with the manifest's directory; workspace
 * roots never match on their own. `"scope": "repo"` profiles are detected across the whole project and keep
 * their paths as written. `"companion": true` profiles apply only when another profile of the plugin does.
 */
export function detectProfiles(contract, ctx, only = null) {
  const found = [];
  // A `companion` profile (for example the shared npm dependency rules) applies only next to another profile.
  const entries = Object.entries(contract.profiles ?? {}).sort(([, a], [, b]) => Number(Boolean(a.companion)) - Number(Boolean(b.companion)));
  for (const [name, profile] of entries) {
    if (only && !only.includes(name)) continue;
    if (profile.companion && !only && !found.length) continue;
    if ((profile.scope ?? "package") === "repo") {
      if (only || anyOf(profile.detect ?? {}, ctx, null)) found.push({ name, profile, dirs: [""], paths: profile.paths ?? [] });
      continue;
    }
    const eco = profile.ecosystem ?? contract.ecosystem ?? "npm";
    const dirs = [...new Set(ctx.units.filter((u) => u.ecosystem === eco && !u.workspaceRoot && (only || anyOf(profile.detect ?? {}, ctx, u))).map((u) => u.dir))];
    if (only && !dirs.length) dirs.push("");
    if (!dirs.length) continue;
    const paths = dirs.flatMap((d) => (profile.paths ?? []).map((g) => (d ? `${d}/${g}` : g)));
    found.push({ name, profile, dirs, paths });
  }
  return found;
}

const MARKER = "<!-- Managed by";

function ruleFile(plugin, ruleBody, paths) {
  const globs = [...new Set(paths.flatMap(expandBraces))];
  const fm = ["---", "paths:", ...globs.map((g) => `  - "${g}"`), "---"].join("\n");
  const note = `${MARKER} ${plugin.name} ${plugin.version} via /${plugin.name}:setup. \`--refresh\` rewrites this file; put project rules in another file under .claude/rules/. -->`;
  return `${fm}\n${note}\n\n${ruleBody.trim()}\n`;
}

/** The plugin that already installed this rule body under .claude/rules/<plugin>/<rule>, or null. */
function otherCopy(root, self, rule, body) {
  let dirs = [];
  try {
    dirs = readdirSync(join(root, ".claude", "rules"), { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== self).map((e) => e.name);
  } catch {
    return null;
  }
  const want = lf(body).trim();
  return dirs.find((d) => lf(readText(join(root, ".claude", "rules", d, rule))).includes(want) && want) ?? null;
}

/** One rule file per rule name, covering every detected profile that uses it. */
export function planRules(pluginRoot, plugin, profiles, ctx, { refresh = false } = {}) {
  const byRule = new Map();
  for (const p of profiles) for (const r of p.profile.rules ?? []) byRule.set(r, [...(byRule.get(r) ?? []), ...p.paths]);
  const actions = [];
  for (const [rule, paths] of [...byRule].sort(([a], [b]) => a.localeCompare(b))) {
    const rel = `.claude/rules/${plugin.name}/${rule}`;
    const content = ruleFile(plugin, readText(join(pluginRoot, "rules", rule)), paths);
    const existing = readText(join(ctx.root, rel));
    // A newer plugin version that left the rule unchanged is not a reason to rewrite the file.
    const sameRule = (a, b) => lf(a).replace(/(Managed by \S+) \S+ via/, "$1 via") === lf(b).replace(/(Managed by \S+) \S+ via/, "$1 via");
    // The same rule from another plugin (shared/rules/, for example npm-dependencies.md) is loaded once.
    const twin = existing ? null : otherCopy(ctx.root, plugin.name, rule, readText(join(pluginRoot, "rules", rule)));
    if (twin) actions.push({ rel, action: "skip", note: `the same rule is already installed by ${twin}` });
    else if (!existing) actions.push({ rel, action: "create", content });
    else if (sameRule(existing, content)) actions.push({ rel, action: "skip", note: "up to date" });
    else if (!existing.includes(`${MARKER} ${plugin.name} `)) actions.push({ rel, action: "skip", note: "exists and is not managed by this plugin" });
    else if (!refresh) actions.push({ rel, action: "skip", note: "outdated; run setup with --refresh to update it" });
    else actions.push({ rel, action: "update", content });
  }
  return actions;
}

/**
 * A verify command with its placeholders filled in, or null when the project lacks what it needs. `run` is a
 * string or { posix, win32 } (scripts/verify.mjs picks the platform's command).
 */
function verifyRun(s, ctx) {
  const fill = (run) => (!run.includes("{solution}") ? run : ctx.solution ? run.replaceAll("{solution}", `"${ctx.solution}"`) : null);
  const run = s.run ?? runScript(ctx.pm, s.script);
  if (typeof run === "string") return fill(run);
  const out = Object.fromEntries(Object.entries(run).map(([k, v]) => [k, fill(v)]));
  return Object.values(out).every(Boolean) ? out : null;
}

// `dependabot` is one entry or a list of entries with `when` (Maven or Gradle); the first that holds applies.
const dependabotOf = (contract, ctx) => (Array.isArray(contract.dependabot) ? contract.dependabot.find((d) => holds(d.when, ctx, null)) ?? null : contract.dependabot ?? null);

/** Format entries and verify steps whose conditions hold, plus config list entries from the contract and profiles. */
export function configAdditions(contract, profiles, ctx) {
  const format = (contract.format ?? []).filter((f) => holds(f.when, ctx, null)).map(({ glob, run }) => ({ glob, run }));
  const verify = {};
  for (const stage of ["fast", "full"]) {
    verify[stage] = (contract.verify?.[stage] ?? [])
      .filter((s) => holds({ ...s.when, ...(s.script ? { script: s.script } : {}) }, ctx, null))
      .map((s) => ({ name: s.name, run: verifyRun(s, ctx) }))
      .filter((s) => s.run);
  }
  const lists = {};
  const objects = {};
  const key = (v) => (typeof v === "string" ? v : JSON.stringify(v));
  for (const source of [contract.config ?? {}, ...profiles.map((p) => p.profile.config ?? {})]) {
    for (const [k, value] of Object.entries(source)) {
      if (CONFIG_LISTS.includes(k) && Array.isArray(value)) {
        const seen = new Set((lists[k] ?? []).map(key));
        lists[k] = [...(lists[k] ?? []), ...value.filter((v) => !seen.has(key(v)))];
      }
      // Plugin-owned settings objects (for example dataSql): the first profile to set a field wins.
      else if (!RESERVED.has(k) && value && typeof value === "object" && !Array.isArray(value)) objects[k] = { ...value, ...(objects[k] ?? {}) };
    }
  }
  return { format, verify, lists, objects };
}

/** Append-only merge into .claude/ideal-agentic-env.json. Nothing existing is changed or removed. */
export function planConfig(ctx, additions) {
  const rel = CONFIG;
  const text = readText(join(ctx.root, rel));
  if (!text) return { rel, action: "skip", note: "missing; run /core:init first, then re-run this setup" };
  const cfg = parseJson(text);
  if (!cfg) return { rel, action: "skip", note: "not a valid JSON object; fix it, then re-run" };
  const added = [];
  cfg.format = Array.isArray(cfg.format) ? cfg.format : [];
  for (const f of additions.format) {
    // Another plugin may already run the same formatter on some of these files (stack-node and stack-web
    // both format .ts). Add only the globs it does not cover yet, so no file is formatted twice.
    const covered = new Set(cfg.format.filter((e) => e?.run === f.run && typeof e.glob === "string").flatMap((e) => expandBraces(e.glob)));
    const missing = expandBraces(f.glob).filter((g) => !covered.has(g));
    if (!missing.length) continue;
    const glob = missing.length === expandBraces(f.glob).length ? f.glob : joinGlobs(missing);
    cfg.format.push({ glob, run: f.run });
    added.push(`format ${glob}`);
  }
  cfg.verify = cfg.verify && typeof cfg.verify === "object" ? cfg.verify : {};
  const names = new Set([...(cfg.verify.fast ?? []), ...(cfg.verify.full ?? [])].map((s) => s?.name));
  for (const stage of ["fast", "full"]) {
    for (const s of additions.verify[stage]) {
      if (names.has(s.name)) continue;
      cfg.verify[stage] = [...(cfg.verify[stage] ?? []), s];
      names.add(s.name);
      added.push(`verify.${stage} ${s.name}`);
    }
  }
  const key = (v) => (typeof v === "string" ? v : JSON.stringify(v));
  for (const [k, values] of Object.entries(additions.lists)) {
    const current = Array.isArray(cfg[k]) ? cfg[k] : [];
    const have = new Set(current.map(key));
    const missing = values.filter((v) => !have.has(key(v)));
    if (missing.length) {
      cfg[k] = [...current, ...missing];
      added.push(`${k} ${missing.map((v) => (typeof v === "string" ? v : v.reason ?? v.pattern ?? "entry")).join(", ")}`);
    }
  }
  for (const [k, value] of Object.entries(additions.objects ?? {})) {
    const current = cfg[k] && typeof cfg[k] === "object" && !Array.isArray(cfg[k]) ? cfg[k] : null;
    if (!current && k in cfg) continue; // the project set something else; leave it alone
    const missing = Object.keys(value).filter((x) => !current || !(x in current));
    if (!missing.length) continue;
    cfg[k] = { ...(current ?? {}), ...Object.fromEntries(missing.map((x) => [x, value[x]])) };
    added.push(missing.map((x) => `${k}.${x}`).join(", "));
  }
  if (!added.length) return { rel, action: "skip", note: "already configured" };
  return { rel, action: "merge", note: `adds ${added.join("; ")}`, content: `${JSON.stringify(cfg, null, 2)}\n` };
}

/**
 * Directories (POSIX, "/"-rooted) holding one of the contract's lockfiles; a workspace root covers its members.
 * An ecosystem without lockfiles (Maven) uses its outermost manifests instead.
 */
export function lockfileDirs(contract, ctx) {
  const entry = dependabotOf(contract, ctx);
  const names = new Set(entry?.lockfiles ?? []);
  if (!names.size) {
    const eco = UNIT_ECOSYSTEM[entry?.ecosystem];
    const own = ctx.units.filter((u) => u.ecosystem === eco).map((u) => u.dir);
    const outer = [...new Set(own)].filter((d) => !own.some((o) => o !== d && (o === "" || d.startsWith(`${o}/`))));
    return outer.map((d) => `/${d}`).sort();
  }
  const dirs = ctx.files.filter((f) => names.has(f.split("/").pop())).map((f) => (f.includes("/") ? `/${f.slice(0, f.lastIndexOf("/"))}` : "/"));
  return dirs.includes("/") ? ["/"] : [...new Set(dirs)].sort();
}

/** Append an `updates` entry for the contract's ecosystem to .github/dependabot.yml (governance owns the file). */
export function planDependabot(contract, ctx) {
  const eco = dependabotOf(contract, ctx)?.ecosystem;
  if (!eco) return null;
  const rel = DEPENDABOT;
  const text = readText(join(ctx.root, rel));
  if (!text) return { rel, action: "skip", note: "missing; run /governance:setup first, then re-run this setup" };
  if (new RegExp(`package-ecosystem:\\s*["']?${eco}["']?\\s*$`, "m").test(text)) return { rel, action: "skip", note: `${eco} already configured` }; // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp -- eco comes from the plugin-owned stack.json
  const lines = text.replace(/\s+$/, "").split(/\r?\n/);
  const lastTopLevel = [...lines].reverse().find((l) => /^[A-Za-z]/.test(l));
  if (!/^updates:\s*$/.test(lastTopLevel ?? "")) return { rel, action: "skip", note: "updates: is not the last top-level key; add the entry by hand (see the setup skill)" };
  const dirs = lockfileDirs(contract, ctx);
  const where = dirs.length > 1 ? [`    directories:`, ...dirs.map((d) => `      - "${d}"`)] : [`    directory: "${dirs[0] ?? "/"}"`];
  const block = [
    `  - package-ecosystem: ${eco}`,
    ...where,
    "    schedule:",
    "      interval: weekly",
    "    cooldown:",
    "      default-days: 14",
    "    open-pull-requests-limit: 5",
    "    groups:",
    `      ${eco}-minor-and-patch:`,
    '        patterns: ["*"]',
    "        update-types: [minor, patch]",
  ];
  return { rel, action: "merge", note: `adds ${eco} (${dirs.join(", ") || "/"})`, content: `${lines.join("\n")}\n${block.join("\n")}\n` };
}

// ---------- CI blocks (ADR-0010) ----------
//
// The verify job in .github/workflows/ci.yml has three regions. Each stack plugin owns one block in each:
//
//   services   job services (databases), before the job's `steps:`
//   steps      setup steps that `verify --full` needs (toolchains, browsers), before the verify step
//   after      steps after it (artifact uploads)
//
// A region is delimited by `# >>> ideal-agentic-env:<kind>` and `# <<< ideal-agentic-env:<kind>`, and a
// plugin's block inside it starts with `# --- <plugin> <version>`. Setup rewrites only its own block; the
// rest of the workflow is the project's.

export const CI_KINDS = ["services", "steps", "after"];
const regionStart = (kind) => `# >>> ideal-agentic-env:${kind} (stack plugins' setup writes here; edit outside these markers)`;
const regionEnd = (kind) => `# <<< ideal-agentic-env:${kind}`;
const START_RE = /^(\s*)# >>> ideal-agentic-env:(services|steps|after)\b/;
const END_RE = /^\s*# <<< ideal-agentic-env:(services|steps|after)\b/;
const BLOCK_RE = /^\s*# --- ([a-z0-9-]+)(?: (\S+))?\s*$/;
const usesOf = (text) => [...text.matchAll(/uses:\s*["']?([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/g)].map((m) => m[1].toLowerCase());
const runsOf = (text) => [...text.matchAll(/^\s*-?\s*run:\s*(.+?)\s*$/gm)].map((m) => m[1].replace(/\s+/g, " "));

/** The CI fragments of the contract whose conditions hold, rendered for this project. */
export function ciFragments(pluginRoot, contract, ctx) {
  const out = { services: [], steps: [], after: [] };
  for (const kind of CI_KINDS) {
    for (const f of contract.ci?.[kind] ?? []) {
      if (!holds(f.when, ctx, null)) continue;
      // {{DIR}}: the first manifest that satisfies the fragment's dependency condition ("." for the root).
      const unit = f.when?.dependencies ? ctx.units.find((u) => f.when.dependencies.some((n) => u.deps.has(n))) : null;
      const text = lf(readText(join(pluginRoot, f.file)))
        .replace(/\s+$/, "")
        .replaceAll("{{DIR}}", unit?.dir || ".")
        .replaceAll("{{JAVA_VERSION}}", ctx.javaVersion ?? "25");
      out[kind].push({ file: f.file, text, note: f.note ?? null });
    }
  }
  return out;
}

/** Add the three regions to a core-shaped ci.yml that lacks them (projects scaffolded before core 0.4.0). */
export function ensureRegions(text) {
  const lines = lf(text).split("\n");
  const has = (kind) => lines.some((l) => START_RE.exec(l)?.[2] === kind);
  const v = lines.findIndex((l) => /^\s*- run: node scripts\/verify\.mjs --full\s*$/.test(l));
  if (v < 0) return { text: lf(text), added: [], missing: CI_KINDS.filter((k) => !has(k)) };
  const ind = /^(\s*)/.exec(lines[v])[1];
  const added = [];
  if (!has("after")) {
    lines.splice(v + 1, 0, `${ind}${regionStart("after")}`, `${ind}${regionEnd("after")}`);
    added.push("after");
  }
  if (!has("steps")) {
    lines.splice(v, 0, `${ind}${regionStart("steps")}`, `${ind}${regionEnd("steps")}`);
    added.push("steps");
  }
  const missing = [];
  if (!has("services")) {
    const verifyAt = lines.findIndex((l) => /^\s*- run: node scripts\/verify\.mjs --full\s*$/.test(l));
    let s = verifyAt;
    while (s >= 0 && !/^\s*steps:\s*$/.test(lines[s])) s--;
    const jobInd = s >= 0 ? /^(\s*)/.exec(lines[s])[1] : null;
    let top = s;
    while (top > 0 && (lines[top - 1].trim() === "" || /^(\s*)/.exec(lines[top - 1])[1].length >= (jobInd?.length ?? 0))) top--;
    const jobHasServices = s >= 0 && lines.slice(top, s).some((l) => new RegExp(`^${jobInd}services:`).test(l)); // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp -- jobInd is whitespace taken from the file
    if (s < 0 || jobHasServices) missing.push("services");
    else {
      lines.splice(s, 0, `${jobInd}${regionStart("services")}`, `${jobInd}${regionEnd("services")}`);
      added.push("services");
    }
  }
  return { text: lines.join("\n"), added, missing };
}

/** Parse one region: its indentation and each plugin's block (lines without the region's indentation). */
function readRegion(lines, kind) {
  const start = lines.findIndex((l) => START_RE.exec(l)?.[2] === kind);
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && END_RE.exec(l)?.[1] === kind);
  if (end < 0) return null;
  const ind = START_RE.exec(lines[start])[1];
  const inner = kind === "services" ? `${ind}  ` : ind;
  const blocks = new Map();
  let current = null;
  for (const l of lines.slice(start + 1, end)) {
    const b = BLOCK_RE.exec(l);
    if (b) {
      current = b[1];
      blocks.set(current, { version: b[2] ?? "", lines: [] });
    } else if (current && !(kind === "services" && l.trim() === "services:")) blocks.get(current).lines.push(l.startsWith(inner) ? l.slice(inner.length) : l.trimStart());
  }
  return { start, end, ind, inner, blocks };
}

function writeRegion(kind, region) {
  const names = [...region.blocks.keys()].filter((n) => region.blocks.get(n).lines.length).sort();
  const out = [`${region.ind}${regionStart(kind)}`];
  if (kind === "services" && names.length) out.push(`${region.ind}services:`);
  for (const n of names) {
    const b = region.blocks.get(n);
    out.push(`${region.inner}# --- ${n}${b.version ? ` ${b.version}` : ""}`, ...b.lines.map((l) => (l ? `${region.inner}${l}` : "")));
  }
  out.push(`${region.ind}${regionEnd(kind)}`);
  return out;
}

/** This plugin's blocks in ci.yml: add them, refresh them (--refresh), or say why they cannot be written. */
export function planCi(pluginRoot, plugin, contract, ctx, { refresh = false } = {}) {
  if (!contract.ci) return { action: null, notes: [] };
  const frags = ciFragments(pluginRoot, contract, ctx);
  const rel = CI;
  const original = readText(join(ctx.root, rel));
  const wanted = CI_KINDS.some((k) => frags[k].length);
  if (!original) return wanted ? { action: { rel, action: "skip", note: "missing; run /core:init first, then re-run this setup" }, notes: [] } : { action: null, notes: [] };
  const hasBlock = lf(original).split("\n").some((l) => BLOCK_RE.exec(l)?.[1] === plugin.name);
  if (!wanted && !hasBlock) return { action: null, notes: [] };
  const ensured = ensureRegions(original);
  let lines = ensured.text.split("\n");
  const notes = [];
  const outside = (region) => [...lines.slice(0, region.start), ...lines.slice(region.end + 1)].join("\n");
  const wrote = [];
  let outdated = false;
  for (const kind of CI_KINDS) {
    const region = readRegion(lines, kind);
    if (!region) {
      for (const f of frags[kind]) notes.push(`${rel} has no ideal-agentic-env:${kind} region; add the block from ${plugin.name}/${f.file} by hand`);
      continue;
    }
    // Skip what the workflow already has elsewhere: an action the project set up itself, or a service another block defines.
    const elsewhere = outside(region);
    const others = [...region.blocks].filter(([n]) => n !== plugin.name).map(([, b]) => b.lines.join("\n")).join("\n");
    const keep = frags[kind].filter((f) => {
      const uses = usesOf(f.text);
      if (kind !== "services" && uses.length && uses.every((u) => usesOf(elsewhere + others).includes(u))) {
        notes.push(`${rel} already uses ${uses.join(", ")}; ${plugin.name}/${f.file} not added`);
        return false;
      }
      const runs = runsOf(f.text);
      if (kind !== "services" && !uses.length && runs.length && runs.every((r) => runsOf(elsewhere + others).includes(r))) {
        notes.push(`${rel} already runs ${runs.join("; ")}; ${plugin.name}/${f.file} not added`);
        return false;
      }
      const service = kind === "services" ? /^([A-Za-z0-9_-]+):/.exec(f.text)?.[1] : null;
      if (service && new RegExp(`^\\s+${service}:\\s*$`, "m").test(`${elsewhere}\n${others}`)) { // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp -- service is a YAML key from a plugin-owned fragment, [A-Za-z0-9_-] only
        notes.push(`${rel} already defines the ${service} service; ${plugin.name}/${f.file} not added`);
        return false;
      }
      return true;
    });
    const mine = keep.flatMap((f, i) => [...(i ? [""] : []), ...f.text.split("\n")]);
    const current = region.blocks.get(plugin.name);
    if (current && current.lines.join("\n") === mine.join("\n")) continue;
    if (current && !refresh) {
      outdated = true;
      continue;
    }
    if (!current && !mine.length) continue;
    region.blocks.set(plugin.name, { version: plugin.version, lines: mine });
    for (const f of keep) if (f.note) notes.push(`ci.yml (${kind}): ${f.note}`);
    lines = [...lines.slice(0, region.start), ...writeRegion(kind, region), ...lines.slice(region.end + 1)];
    wrote.push(kind);
  }
  if (ensured.missing.length && wanted && ensured.missing.some((k) => frags[k].length))
    notes.push(`${rel}: the verify job already declares services: outside the ideal-agentic-env markers; move them into a services region (see the core:init template) to let setup manage them`);
  // Regions are added only together with a block of ours, so a plugin with nothing to write changes nothing.
  if (!wrote.length) return { action: { rel, action: "skip", note: outdated ? "outdated; run setup with --refresh to update this plugin's CI blocks" : "nothing to add" }, notes };
  const note = [ensured.added.length ? `adds the ideal-agentic-env regions (${ensured.added.join(", ")})` : null, `writes ${plugin.name}'s ${wrote.join(", ")} block${wrote.length > 1 ? "s" : ""}`].filter(Boolean).join("; ");
  return { action: { rel, action: "merge", note, content: lines.join("\n") }, notes };
}

// ---------- notes ----------

/** The remote's default branch (origin/HEAD), or "main". Templates get it as {{DEFAULT_BRANCH}}. */
export function defaultBranch(root) {
  const r = spawnSync("git", ["-C", root, "symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"], { encoding: "utf8", windowsHide: true, timeout: 5000 });
  const name = r.status === 0 ? r.stdout.trim().replace(/^origin\//, "") : "";
  return /^[\w./-]+$/.test(name) ? name : "main";
}

function gitIgnored(root, rel) {
  const r = spawnSync("git", ["-C", root, "check-ignore", "-q", rel], { windowsHide: true, timeout: 5000 });
  return r.status === 0;
}

// Looked up on PATH without running it: some language servers (jdtls) have no --version and would start.
function onPath(binary) {
  const exts = process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
  return (process.env.PATH ?? "").split(delimiter).some((dir) => dir && exts.some((e) => existsSync(join(dir, binary + e))));
}

/** Things the project should fix that setup cannot or must not do itself. */
export function notes(contract, profiles, ctx, additions) {
  const out = [];
  // Lockfile notes apply to package ecosystems only (npm, NuGet), not to Dependabot's docker entry.
  const dep = dependabotOf(contract, ctx);
  const eco = UNIT_ECOSYSTEM[dep?.ecosystem];
  const units = eco ? ctx.units.filter((u) => u.ecosystem === eco) : [];
  if (dep?.lockfiles?.length && units.length) {
    const lock = ctx.files.filter((f) => dep.lockfiles.includes(f.split("/").pop()));
    if (!lock.length) out.push(`no lockfile (${dep.lockfiles.join(", ")}); ${contract.lockfileHint ?? "commit one: CI installs with it and OSV-Scanner reads it"}`);
    for (const f of lock) if (gitIgnored(ctx.root, f)) out.push(`${f} is git-ignored; commit it`);
  }
  if (contract.lsp?.binary && profiles.length && !onPath(contract.lsp.binary)) out.push(`LSP binary ${contract.lsp.binary} not found; install it for code intelligence: ${contract.lsp.install}`);
  // hints: project-specific advice that applies `when` its condition holds (for example a missing tool).
  for (const h of contract.hints ?? []) if (holds(h.when, ctx, null)) out.push(h.note);
  if (contract.format?.length && !additions.format.length) out.push(`no formatter found; ${contract.formatHint ?? "add one and re-run setup"}`);
  for (const stage of ["fast", "full"]) {
    for (const s of contract.verify?.[stage] ?? []) {
      if (s.script && s.recommended && !ctx.rootPkg?.scripts?.[s.script]) out.push(`root package.json has no "${s.script}" script (${s.recommended})`);
      if (JSON.stringify(s.run ?? "").includes("{solution}") && !ctx.solution && holds(s.when, ctx, null))
        out.push(`no solution file at the repository root, so "${s.name}" was not added; create one (dotnet new sln, then dotnet sln add for each project) and re-run setup`);
    }
  }
  return out;
}

/** The whole add-only plan for one project. */
export function buildStackPlan(pluginRoot, plugin, contract, target, opts = {}) {
  const ctx = contextFor(target);
  const profiles = detectProfiles(contract, ctx, opts.profiles?.length ? opts.profiles : null);
  const unknown = (opts.profiles ?? []).filter((p) => !(p in (contract.profiles ?? {})));
  if (unknown.length) throw new Error(`unknown profile(s): ${unknown.join(", ")}; use ${Object.keys(contract.profiles ?? {}).join(", ")}`);
  if (!profiles.length) return { root: ctx.root, profiles: [], actions: [], notes: ["no matching profile detected; pass --profiles to choose one"] };
  const additions = configAdditions(contract, profiles, ctx);
  const ci = planCi(pluginRoot, plugin, contract, ctx, opts);
  const actions = [
    ...planRules(pluginRoot, plugin, profiles, ctx, opts),
    planConfig(ctx, additions),
    ci.action,
    planDependabot(contract, ctx),
    ...(contract.templates ? planTemplates(ctx.root, join(pluginRoot, "skills", "setup", "templates"), { DEFAULT_BRANCH: defaultBranch(ctx.root), ...(contract.templateVars ?? {}) }, undefined, { plugin, refresh: opts.refresh, adopt: opts.adopt ?? [] }) : []),
  ].filter(Boolean);
  return {
    root: ctx.root,
    profiles: profiles.map((p) => `${p.name}${p.dirs.some(Boolean) ? ` (${p.dirs.map((d) => d || ".").join(", ")})` : ""}`),
    actions,
    notes: [...notes(contract, profiles, ctx, additions), ...ci.notes],
  };
}
