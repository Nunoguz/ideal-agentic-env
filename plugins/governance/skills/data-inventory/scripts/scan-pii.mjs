#!/usr/bin/env node
// Discovery for the data-inventory skill. It lists schema-file lines that look like personal data,
// using the same heuristic as the inventory-check hook and the CI compliance gate.
//
//   node scan-pii.mjs [--root .] [--json]
import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, findPersonalData, governanceConfig, isSchemaPath } from "../../../hooks/lib/pii-rules.mjs";

const SKIP = new Set(["node_modules", ".git", "dist", "build", "target", "bin", "obj", ".venv", "venv", ".next", "vendor", "coverage"]);
const MAX_FILES = 5000;
const MAX_BYTES = 1024 * 1024;

function* walk(root, dir = root) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP.has(e.name)) yield* walk(root, join(dir, e.name));
    } else if (e.isFile()) yield relative(root, join(dir, e.name)).replace(/\\/g, "/");
  }
}

export function scan(root) {
  let cfg = governanceConfig(null);
  try {
    cfg = governanceConfig(JSON.parse(readFileSync(join(root, ".claude/ideal-agentic-env.json"), "utf8")));
  } catch {
    /* no project config: defaults */
  }
  const hits = [];
  let files = 0;
  let truncated = false;
  for (const rel of walk(root)) {
    if (!isSchemaPath(rel, cfg.schemaPaths)) continue;
    if (++files > MAX_FILES) {
      truncated = true;
      break;
    }
    const path = join(root, rel);
    if (statSync(path).size > MAX_BYTES) continue;
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .forEach((text, i) => {
        const found = findPersonalData(text, cfg.piiTerms);
        if (found.length) hits.push({ file: rel, line: i + 1, found });
      });
  }
  return { hits, files: Math.min(files, MAX_FILES), truncated };
}

const isMain = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isMain) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--root");
  const root = i >= 0 ? args[i + 1] : ".";
  const result = scan(root);
  if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else {
    for (const h of result.hits) console.log(`${h.file}:${h.line}  ${describe(h.found)}`);
    console.log(`\n${result.hits.length} line(s) in ${result.files} schema file(s)${result.truncated ? ` (stopped after ${MAX_FILES} files)` : ""}. Heuristic: review each hit in context.`);
  }
}
