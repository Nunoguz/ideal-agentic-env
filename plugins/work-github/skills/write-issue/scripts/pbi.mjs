#!/usr/bin/env node
// Local product backlog items (work-github). Deterministic numbering, listing and status changes for
// docs/pbi/PBI-NNNN-<slug>.md files. The content follows ../references/work-item.md.
//
//   node pbi.mjs new --title "<title>" [--type feature|bug|chore|spike] [--priority p1|p2|p3] [--root .]
//   node pbi.mjs list [--status <status>] [--json] [--root .]
//   node pbi.mjs set <PBI-NNNN> [--status <status>] [--priority <p>] [--issue <#N|url>] [--plan <path>] [--root .]
//   node pbi.mjs path <PBI-NNNN> [--root .]
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = join(HERE, "..", "templates", "pbi.md.tmpl");
export const DIR = "docs/pbi";
export const TYPES = ["feature", "bug", "chore", "spike"];
export const STATUSES = ["proposed", "ready", "in-progress", "in-review", "done", "dropped"];
export const PRIORITIES = ["p1", "p2", "p3"];
const FILE_RE = /^(PBI-(\d{4,}))-[a-z0-9-]+\.md$/;
const FOLD = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", Ç: "c", Ğ: "g", İ: "i", Ö: "o", Ş: "s", Ü: "u" };

export function slugify(title) {
  const slug = String(title)
    .replace(/[çğıöşüÇĞİÖŞÜ]/g, (c) => FOLD[c])
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
  return slug || "item";
}

function files(root) {
  const dir = join(root, DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((f) => ({ f, m: FILE_RE.exec(f) }))
    .filter((x) => x.m)
    .map(({ f, m }) => ({ id: m[1], n: Number(m[2]), rel: `${DIR}/${f}` }))
    .sort((a, b) => a.n - b.n);
}

// One static pattern per header line; no regex is ever built from input.
const FIELDS = {
  Type: /^(- \*\*Type:\*\*) *(.*)$/m,
  Status: /^(- \*\*Status:\*\*) *(.*)$/m,
  Priority: /^(- \*\*Priority:\*\*) *(.*)$/m,
  Issue: /^(- \*\*Issue:\*\*) *(.*)$/m,
  Plan: /^(- \*\*Plan:\*\*) *(.*)$/m,
};
const field = (text, name) => FIELDS[name].exec(text)?.[2].trim() ?? null;

export function readItem(root, entry) {
  const text = readFileSync(join(root, entry.rel), "utf8");
  const title = /^# PBI-\d+:\s*(.+)$/m.exec(text)?.[1].trim() ?? "";
  return { id: entry.id, path: entry.rel, title, type: field(text, "Type"), status: field(text, "Status"), priority: field(text, "Priority"), issue: field(text, "Issue"), plan: field(text, "Plan") };
}

export function list(root, { status } = {}) {
  return files(root)
    .map((e) => readItem(root, e))
    .filter((i) => !status || i.status === status);
}

export function find(root, id) {
  const want = String(id).toUpperCase();
  return files(root).find((e) => e.id === want || e.n === Number(want.replace(/^PBI-/, ""))) ?? null;
}

export function create(root, { title, type = "feature", priority = "p2" }) {
  const clean = String(title ?? "").replace(/\s+/g, " ").trim();
  if (!clean) throw new Error("--title is required");
  if (!TYPES.includes(type)) throw new Error(`--type must be one of ${TYPES.join(", ")}`);
  if (!PRIORITIES.includes(priority)) throw new Error(`--priority must be one of ${PRIORITIES.join(", ")}`);
  const n = (files(root).at(-1)?.n ?? 0) + 1;
  const id = `PBI-${String(n).padStart(4, "0")}`;
  const rel = `${DIR}/${id}-${slugify(clean)}.md`;
  const vars = { ID: id, TITLE: clean, TYPE: type, PRIORITY: priority };
  const content = readFileSync(TEMPLATE, "utf8").replace(/\{\{([A-Z]+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
  mkdirSync(join(root, DIR), { recursive: true });
  writeFileSync(join(root, rel), content, { flag: "wx" });
  return { id, path: rel };
}

export function set(root, id, changes) {
  const entry = find(root, id);
  if (!entry) throw new Error(`no such PBI: ${id}`);
  if (changes.status && !STATUSES.includes(changes.status)) throw new Error(`--status must be one of ${STATUSES.join(", ")}`);
  if (changes.priority && !PRIORITIES.includes(changes.priority)) throw new Error(`--priority must be one of ${PRIORITIES.join(", ")}`);
  const path = join(root, entry.rel);
  let text = readFileSync(path, "utf8");
  for (const [key, name] of [["status", "Status"], ["priority", "Priority"], ["issue", "Issue"], ["plan", "Plan"]]) {
    if (changes[key] === undefined) continue;
    const value = String(changes[key]).replace(/[\r\n]+/g, " ").trim();
    const re = FIELDS[name];
    if (!re.test(text)) throw new Error(`${entry.rel} has no "${name}" line`);
    text = text.replace(re, (_, head) => `${head} ${value}`);
  }
  writeFileSync(path, text);
  return readItem(root, entry);
}

function parse(argv) {
  const [cmd, ...rest] = argv;
  const opts = { _: [] };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--json") opts.json = true;
    else if (a.startsWith("--")) {
      const value = rest[++i];
      if (value === undefined) throw new Error(`${a} needs a value`);
      opts[a.slice(2)] = value;
    } else opts._.push(a);
  }
  return { cmd, opts };
}

const isMain = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const { cmd, opts } = parse(process.argv.slice(2));
    const root = opts.root ?? ".";
    if (cmd === "new") console.log(create(root, opts).path);
    else if (cmd === "list") {
      const items = list(root, opts);
      if (opts.json) console.log(JSON.stringify(items, null, 2));
      else for (const i of items) console.log(`${i.id}  ${(i.status ?? "?").padEnd(11)} ${(i.priority ?? "").padEnd(3)} ${i.title}`);
    } else if (cmd === "set") console.log(JSON.stringify(set(root, opts._[0], opts)));
    else if (cmd === "path") {
      const e = find(root, opts._[0]);
      if (!e) throw new Error(`no such PBI: ${opts._[0]}`);
      console.log(e.rel);
    } else throw new Error("usage: pbi.mjs new|list|set|path (see the header of this file)");
  } catch (err) {
    console.error(`pbi: ${err.message}`);
    process.exit(1);
  }
}
