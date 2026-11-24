// Deterministic scaffolding used by the plugins' setup skills. It is add-only for files the project owns:
// it creates what is missing, adds missing top-level keys to JSON files, and reports the rest as "skip".
// Managed files (ADR-0008: CI scripts and workflows under .github/scripts/ and .github/workflows/) carry a
// marker with the hash of what setup wrote; `--refresh` replaces them only while that hash still matches,
// so a file someone edited by hand is never overwritten.
// Shared file: the source of truth is shared/scaffold-lib.mjs in the marketplace repo (npm run sync).

import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const EXECUTABLE = /^\.githooks\//;
const MANAGED_PATH = /^\.github\/(scripts|workflows)\//;
const MARK_RE = /^(?:\/\/|#) Managed by ([a-z0-9-]+) (\S+) \(ideal-agentic-env\)\. .*sha256:([0-9a-f]{16})\s*$/;
const lf = (text) => text.replace(/\r\n/g, "\n");

/** Files that setup owns in the project and may update later (ADR-0008). */
export const isManagedPath = (rel) => MANAGED_PATH.test(rel);

/** Short content hash of a managed file's body (line endings normalized, so a Windows checkout matches). */
export const contentHash = (text) => createHash("sha256").update(lf(text)).digest("hex").slice(0, 16);

/** `body` with the managed marker inserted as the first line (after a shebang). */
export function withMarker(rel, body, plugin) {
  const c = /\.[cm]?[jt]s$/.test(rel) ? "//" : "#";
  const line = `${c} Managed by ${plugin.name} ${plugin.version} (ideal-agentic-env). /${plugin.name}:setup --refresh updates this file while it is unedited; edit it and setup leaves it alone. sha256:${contentHash(body)}`;
  const lines = lf(body).split("\n");
  lines.splice(lines[0]?.startsWith("#!") ? 1 : 0, 0, line);
  return lines.join("\n");
}

/** The marker of a managed file: who wrote it, which version, and whether its body is still unedited. */
export function readMarker(text) {
  const lines = lf(text).split("\n");
  const i = lines.findIndex((l, n) => n < 3 && MARK_RE.test(l));
  if (i < 0) return null;
  const [, plugin, version, hash] = MARK_RE.exec(lines[i]);
  lines.splice(i, 1);
  const body = lines.join("\n");
  return { plugin, version, body, edited: contentHash(body) !== hash };
}

/**
 * The action for one managed file that already exists. `adopt` lists paths the user explicitly agreed to
 * replace although setup cannot prove they are unedited (an unmarked copy from an older release, or a
 * copy edited by hand).
 */
export function planManaged(rel, existing, body, plugin, { refresh = false, adopt = [] } = {}) {
  const content = withMarker(rel, body, plugin);
  const replace = (note) => ({ rel, action: "update", note, content });
  const mark = readMarker(existing);
  if (mark && mark.plugin !== plugin.name) return { rel, action: "skip", note: `managed by ${mark.plugin}` };
  if (mark) {
    if (mark.body === lf(body)) return { rel, action: "skip", note: "up to date" };
    if (adopt.includes(rel)) return replace(`replaces a copy edited by hand (--adopt)`);
    if (mark.edited) return { rel, action: "skip", note: `edited by hand since ${mark.version}; not refreshed. Compare with --print ${rel}, merge by hand or re-run with --adopt ${rel}` };
    return refresh ? replace(`${mark.version} -> ${plugin.version}`) : { rel, action: "skip", note: `outdated (${mark.version}); run setup with --refresh` };
  }
  if (lf(existing) === lf(body)) return refresh ? replace("adds the managed marker") : { rel, action: "skip", note: "up to date (unmarked; --refresh adds the marker)" };
  if (adopt.includes(rel)) return replace("replaces an unmarked copy (--adopt)");
  return { rel, action: "skip", note: `exists without a managed marker (an older release or a project file). Compare with --print ${rel}; replace it with --refresh --adopt ${rel}` };
}

export function readText(p) {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

/** Every file below `dir`, as POSIX paths relative to it. */
export function templateFiles(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? templateFiles(p, base) : [relative(base, p).replace(/\\/g, "/")];
  });
}

/** Replace {{UPPER_CASE}} placeholders. An empty value on its own line removes the line. */
export function render(text, vars) {
  return text.replace(/\{\{([A-Z_]+)\}\}\n?/g, (m, key) => {
    if (!(key in vars)) return m;
    const value = vars[key];
    return value === "" ? "" : m.endsWith("\n") ? `${value}\n` : value;
  });
}

/**
 * Plan the actions for every `*.tmpl` below `templatesDir` that `include(rel)` accepts. Project files are
 * created or skipped. With `opts.plugin` ({ name, version }), managed paths get a marker and may be
 * updated (see planManaged).
 */
export function planTemplates(root, templatesDir, vars = {}, include = () => true, opts = {}) {
  const actions = [];
  for (const tmpl of templateFiles(templatesDir).filter((f) => f.endsWith(".tmpl")).sort()) {
    const rel = tmpl.replace(/\.tmpl$/, "");
    if (!include(rel)) continue;
    const body = render(readText(join(templatesDir, tmpl)), vars);
    const managed = Boolean(opts.plugin) && isManagedPath(rel);
    const path = join(root, rel);
    if (!existsSync(path)) actions.push({ rel, action: "create", content: managed ? withMarker(rel, body, opts.plugin) : body });
    else if (managed) actions.push(planManaged(rel, readText(path), body, opts.plugin, opts));
    else actions.push({ rel, action: "skip", note: "exists" });
  }
  return actions;
}

/** Add the top-level keys of `patch` that `rel` (a JSON file) does not have yet. */
export function planJsonMerge(root, rel, patch) {
  const p = join(root, rel);
  if (!existsSync(p)) return { rel, action: "create", content: `${JSON.stringify(patch, null, 2)}\n` };
  let existing;
  try {
    existing = JSON.parse(readText(p));
  } catch {
    return { rel, action: "skip", note: "exists but is not valid JSON; fix it, then re-run" };
  }
  if (!existing || typeof existing !== "object" || Array.isArray(existing)) return { rel, action: "skip", note: "not a JSON object" };
  const missing = Object.keys(patch).filter((k) => !(k in existing));
  if (!missing.length) return { rel, action: "skip", note: "already configured" };
  const merged = { ...existing, ...Object.fromEntries(missing.map((k) => [k, patch[k]])) };
  return { rel, action: "merge", note: `adds ${missing.join(", ")}`, content: `${JSON.stringify(merged, null, 2)}\n` };
}

export function apply(root, actions) {
  for (const a of actions) {
    if (a.action === "skip") continue;
    const p = join(root, a.rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, a.content);
    if (EXECUTABLE.test(a.rel) && process.platform !== "win32") chmodSync(p, 0o755);
  }
}

export function report(actions, { dryRun = false, json = false, root, extra = {} } = {}) {
  if (json) return JSON.stringify({ root, dryRun, ...extra, actions: actions.map(({ content, ...a }) => a) }, null, 2);
  const lines = [`${dryRun ? "[dry run] " : ""}target: ${root}`];
  for (const [key, value] of Object.entries(extra)) lines.push(`${key}: ${Array.isArray(value) ? value.join(", ") : value}`);
  for (const a of actions) lines.push(`  ${a.action.padEnd(6)} ${a.rel}${a.note ? `  (${a.note})` : ""}`);
  return lines.join("\n");
}

/**
 * Tiny argument parser. `spec` maps "--flag" to "string" | "boolean" | "list".
 * Unknown flags throw, so a typo never silently changes what gets written.
 */
export function parseArgs(argv, spec) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const kind = spec[flag];
    if (!kind) throw new Error(`unknown argument: ${flag}`);
    const key = flag.replace(/^--/, "").replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (kind === "boolean") out[key] = true;
    else {
      const value = argv[++i];
      if (value === undefined || value.startsWith("--")) throw new Error(`${flag} needs a value`);
      out[key] = kind === "list" ? value.split(",").map((s) => s.trim()).filter(Boolean) : value;
    }
  }
  return out;
}

/** True when the module at `importMetaUrl` is the entry script (symlinked paths such as macOS /var count). */
export function isMain(importMetaUrl) {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(importMetaUrl));
  } catch {
    return false;
  }
}

/** The content setup would write to `rel` (for `--print`): the planned content, or the current file when it is up to date. */
export function proposed(root, actions, rel) {
  const a = actions.find((x) => x.rel === rel);
  if (!a) throw new Error(`setup does not write ${rel}`);
  if (a.content !== undefined) return a.content;
  if (a.note?.startsWith("up to date")) return readText(join(root, rel));
  throw new Error(`nothing to print for ${rel} (${a.note ?? a.action})`);
}
