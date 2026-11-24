#!/usr/bin/env node
// Vendored shared files. An installed plugin ships only its own directory, so code used by several
// plugins is copied into each of them. shared/ is the single source of truth; shared/manifest.json
// lists the copies.
//
//   node scripts/shared.mjs          copy every shared file over its copies (npm run sync)
//   checkShared(root)                drift report used by validate.mjs

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function manifest(root) {
  const p = join(root, "shared", "manifest.json");
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}

const normalize = (buf) => buf.toString("utf8").replace(/\r\n/g, "\n");

/** Errors for missing sources, missing copies and copies that differ from their source. */
export function checkShared(root) {
  const errors = [];
  let m;
  try {
    m = manifest(root);
  } catch (e) {
    return [`shared/manifest.json: invalid JSON (${e.message})`];
  }
  if (!m) return errors;
  for (const [source, copies] of Object.entries(m.files ?? {})) {
    const src = join(root, "shared", source);
    if (!existsSync(src)) {
      errors.push(`shared/${source}: listed in shared/manifest.json but missing`);
      continue;
    }
    const want = normalize(readFileSync(src));
    for (const copy of copies) {
      const dst = join(root, copy);
      if (!existsSync(dst)) errors.push(`${copy}: missing copy of shared/${source}; run npm run sync`);
      else if (normalize(readFileSync(dst)) !== want)
        errors.push(`${copy}: differs from shared/${source}; edit the shared file, then run npm run sync`);
    }
  }
  return errors;
}

export function syncShared(root) {
  const m = manifest(root);
  const written = [];
  for (const [source, copies] of Object.entries(m?.files ?? {})) {
    const content = readFileSync(join(root, "shared", source));
    for (const copy of copies) {
      const dst = join(root, copy);
      mkdirSync(dirname(dst), { recursive: true });
      writeFileSync(dst, content);
      written.push(copy);
    }
  }
  return written;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  for (const f of syncShared(root)) console.log(`synced ${f}`);
}
