#!/usr/bin/env node
// Creates a plugin skeleton from templates/<kind>-plugin/ and registers it: the marketplace entry and the shared
// setup scripts (shared/manifest.json, then npm run sync). The skeleton is version 0.0.1, which validate exempts
// from the kind's contract until the plugin is filled in and released (docs/YENI-BULUT-EKLEME.md).
//
//   node scripts/new-plugin.mjs --kind cloud --name cloud-aws --provider "AWS" --cli aws [--dry-run]
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { syncShared } from "./shared.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const KINDS = { cloud: { prefix: "cloud-", category: "cloud", sharedSetup: true } };
const SETUP_COPIES = { "scaffold-lib.mjs": "scaffold-lib.mjs", "stack-lib.mjs": "stack-lib.mjs", "stack-setup.mjs": "setup.mjs" };

const files = (dir, base = dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name), base) : [relative(base, join(dir, e.name)).replace(/\\/g, "/")]));

export function plan({ root = REPO, kind, name, provider, cli }) {
  const k = KINDS[kind];
  if (!k) throw new Error(`--kind must be one of ${Object.keys(KINDS).join(", ")}`);
  if (!new RegExp(`^${k.prefix}[a-z0-9]+(-[a-z0-9]+)*$`).test(name ?? "")) throw new Error(`--name must be kebab-case and start with ${k.prefix}`); // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp -- prefix is a constant of KINDS
  if (!/^[A-Za-z0-9 .&()-]{2,40}$/.test(provider ?? "")) throw new Error("--provider must be a display name such as AWS or Google Cloud");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(cli ?? "")) throw new Error("--cli must be the provider's CLI program, such as aws, az or gcloud");
  const dest = join(root, "plugins", name);
  if (existsSync(dest)) throw new Error(`plugins/${name} already exists`);
  const src = join(root, "templates", `${kind}-plugin`);
  const vars = { NAME: name, PROVIDER: provider, CLI: cli };
  const writes = files(src).map((rel) => ({
    path: join(dest, rel.replace(/\.tmpl$/, "")),
    content: readFileSync(join(src, rel), "utf8").replace(/\{\{([A-Z]+)\}\}/g, (m, key) => vars[key] ?? m),
  }));
  return { dest, writes, kind: k };
}

export function apply(root, { dest, writes, kind }, name, provider) {
  for (const w of writes) {
    mkdirSync(dirname(w.path), { recursive: true });
    writeFileSync(w.path, w.content);
  }
  const mpPath = join(root, ".claude-plugin", "marketplace.json");
  const mp = JSON.parse(readFileSync(mpPath, "utf8"));
  const description = JSON.parse(readFileSync(join(dest, ".claude-plugin", "plugin.json"), "utf8")).description;
  // A new plugin starts at 0.0.1, so it is experimental in the catalog until it is proven (ADR-0012).
  mp.plugins.push({ name, source: `./plugins/${name}`, description: `[experimental] ${description}`, category: kind.category });
  writeFileSync(mpPath, `${JSON.stringify(mp, null, 2)}\n`);
  if (kind.sharedSetup) {
    const manifestPath = join(root, "shared", "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    for (const [source, file] of Object.entries(SETUP_COPIES)) {
      const copy = `plugins/${name}/skills/setup/scripts/${file}`;
      manifest.files[source] = [...new Set([...(manifest.files[source] ?? []), copy])].sort();
    }
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    syncShared(root);
  }
  return { provider };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const args = process.argv.slice(2);
    const opts = {};
    for (let i = 0; i < args.length; i++) {
      const flag = args[i];
      if (flag === "--dry-run") opts.dryRun = true;
      else if (["--kind", "--name", "--provider", "--cli", "--root"].includes(flag)) {
        if (args[i + 1] === undefined) throw new Error(`${flag} needs a value`);
        opts[flag.slice(2)] = args[++i];
      } else throw new Error(`unknown argument ${flag}`);
    }
    const root = resolve(opts.root ?? REPO);
    const p = plan({ ...opts, root });
    for (const w of p.writes) console.log(`${opts.dryRun ? "would create" : "create"} ${relative(root, w.path)}`);
    if (!opts.dryRun) {
      apply(root, p, opts.name, opts.provider);
      console.log(`\nRegistered ${opts.name} in .claude-plugin/marketplace.json and shared/manifest.json.\nNext: fill it in (docs/YENI-BULUT-EKLEME.md), then npm run check.`);
    }
  } catch (err) {
    console.error(`new-plugin: ${err.message}`);
    process.exit(1);
  }
}
