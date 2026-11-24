#!/usr/bin/env node
// Lists the NuGet packages of a .NET repository and, for each, the newest stable version that has been
// public for at least the cooldown period (14 days by default, the same cooldown Dependabot uses): within
// the current major version, and overall. A release that was pulled or found malicious usually disappears
// within that window. Versions are read from Directory.Packages.props and every *.csproj / *.fsproj;
// publish dates come from the nuget.org registration API. Zero dependencies (Node >= 20).
//
//   node nuget-cooldown.mjs [--target <dir>] [--days 14] [--json]
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SKIP = new Set(["node_modules", ".git", "bin", "obj", "dist", "build", "artifacts"]);
const REGISTRATION = "https://api.nuget.org/v3/registration5-gz-semver2";
const DAY = 864e5;

/** Package versions declared in the repository: Map(id → Set(version)), and where. */
export function declaredPackages(root) {
  const found = new Map();
  const visit = (dir, depth) => {
    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP.has(e.name) && !e.name.startsWith(".") && depth < 8) visit(p, depth + 1);
      } else if (/\.(cs|fs)proj$|^Directory\.Packages\.props$/.test(e.name)) {
        const xml = readFileSync(p, "utf8");
        for (const m of xml.matchAll(/<(?:PackageReference|PackageVersion|GlobalPackageReference)\b([^>]*)>/g)) {
          const id = /\b(?:Include|Update)\s*=\s*"([^"]+)"/.exec(m[1])?.[1];
          const version = /\bVersion(?:Override)?\s*=\s*"([^"]+)"/.exec(m[1])?.[1];
          if (!id || !version || version.includes("$(")) continue;
          const entry = found.get(id) ?? { versions: new Set(), files: new Set() };
          entry.versions.add(version.replace(/^\[|\]$/g, ""));
          entry.files.add(relative(root, p).replace(/\\/g, "/"));
          found.set(id, entry);
        }
      }
    }
  };
  visit(root, 0);
  return found;
}

const parse = (v) => {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-(.+))?$/.exec(v);
  return m ? { parts: [m[1], m[2], m[3] ?? 0, m[4] ?? 0].map(Number), pre: m[5] ?? null } : null;
};
export function compare(a, b) {
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 4; i++) if (pa.parts[i] !== pb.parts[i]) return pa.parts[i] - pb.parts[i];
  return 0;
}

/**
 * From the published versions [{ version, published, listed }], the newest stable one old enough: overall,
 * and within the current version's major.
 */
export function eligible(versions, current, { days = 14, now = Date.now() } = {}) {
  const cutoff = now - days * DAY;
  const stable = versions.filter((v) => v.listed !== false && parse(v.version) && !parse(v.version).pre && Date.parse(v.published) <= cutoff);
  stable.sort((a, b) => compare(b.version, a.version));
  const major = parse(current)?.parts[0];
  const newest = versions.filter((v) => v.listed !== false && parse(v.version) && !parse(v.version).pre).sort((a, b) => compare(b.version, a.version))[0];
  return {
    latest: newest?.version ?? null,
    sameMajor: stable.find((v) => parse(v.version).parts[0] === major)?.version ?? null,
    any: stable[0]?.version ?? null,
  };
}

/** Every published version of a package from the nuget.org registration index (pages fetched when not inlined). */
export async function publishedVersions(id, fetchImpl = fetch) {
  const get = async (url) => {
    const res = await fetchImpl(url, { headers: { Accept: "application/json" } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${url} returned ${res.status}`);
    return res.json();
  };
  const index = await get(`${REGISTRATION}/${id.toLowerCase()}/index.json`);
  if (!index) return [];
  const out = [];
  for (const page of index.items ?? []) {
    const items = page.items ?? (await get(page["@id"]))?.items ?? [];
    for (const it of items) {
      const e = it.catalogEntry ?? {};
      // Unlisted packages are published "1900-01-01" in the registration.
      out.push({ version: e.version, published: e.published, listed: e.listed !== false && !String(e.published).startsWith("1900") });
    }
  }
  return out;
}

export async function report(root, { days = 14, now = Date.now(), fetchImpl = fetch } = {}) {
  const rows = [];
  for (const [id, { versions, files }] of [...declaredPackages(root)].sort(([a], [b]) => a.localeCompare(b))) {
    const current = [...versions].sort(compare).at(-1);
    let e;
    try {
      e = eligible(await publishedVersions(id, fetchImpl), current, { days, now });
    } catch (err) {
      rows.push({ id, current, error: err.message, files: [...files] });
      continue;
    }
    const upgrade = (v) => (v && compare(v, current) > 0 ? v : null);
    rows.push({ id, current, latest: e.latest, sameMajor: upgrade(e.sameMajor), any: upgrade(e.any), files: [...files], mixed: versions.size > 1 ? [...versions] : undefined });
  }
  return rows;
}

function render(rows, days) {
  const lines = [`NuGet packages (cooldown ${days} days):`, ""];
  const w = Math.max(10, ...rows.map((r) => r.id.length));
  lines.push(`${"package".padEnd(w)}  ${"current".padEnd(12)} ${"latest".padEnd(12)} ${"same major".padEnd(12)} any major`);
  for (const r of rows) {
    if (r.error) {
      lines.push(`${r.id.padEnd(w)}  ${r.current.padEnd(12)} error: ${r.error}`);
      continue;
    }
    const wait = r.latest && compare(r.latest, r.current) > 0 && !r.sameMajor && !r.any ? "wait" : "-";
    lines.push(`${r.id.padEnd(w)}  ${r.current.padEnd(12)} ${(r.latest ?? "?").padEnd(12)} ${(r.sameMajor ?? wait).padEnd(12)} ${r.any ?? wait}`);
    if (r.mixed) lines.push(`${" ".repeat(w)}  note: several versions declared (${r.mixed.join(", ")}); move them to Directory.Packages.props`);
  }
  return lines.join("\n");
}

const isMain = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isMain) {
  const args = process.argv.slice(2);
  const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
  for (let i = 0; i < args.length; i++) {
    if (!["--target", "--days", "--json"].includes(args[i])) {
      console.error(`nuget-cooldown: unknown argument ${args[i]}`);
      process.exit(2);
    }
    if (args[i] !== "--json") i++;
  }
  const days = Number(opt("--days", "14"));
  if (!Number.isFinite(days) || days < 0) {
    console.error("nuget-cooldown: --days must be a number");
    process.exit(2);
  }
  try {
    const rows = await report(opt("--target", "."), { days });
    console.log(args.includes("--json") ? JSON.stringify(rows, null, 2) : render(rows, days));
  } catch (err) {
    console.error(`nuget-cooldown: ${err.message}`);
    process.exit(1);
  }
}
