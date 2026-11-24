#!/usr/bin/env node
// Lists the Maven artifacts of a Java repository whose version is written in the build, and for each the
// newest stable version that has been public for at least the cooldown period (14 days by default, the
// same cooldown Dependabot uses): within the current major version, and overall. A release that was pulled
// or found malicious usually disappears within that window. Versions are read from every pom.xml (literal
// versions and ${property} references) and gradle/libs.versions.toml; versions a BOM manages are not
// listed, upgrade the BOM instead. The version list comes from maven-metadata.xml on Maven Central, the
// publish date from the Last-Modified header of each candidate's pom. Zero dependencies (Node >= 20).
//
//   node maven-cooldown.mjs [--target <dir>] [--days 14] [--json]
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SKIP = new Set(["node_modules", ".git", "target", "build", "out", ".gradle", "dist"]);
const CENTRAL = "https://repo1.maven.org/maven2";
const DAY = 864e5;
const PRE = /(alpha|beta|milestone|rc|cr|snapshot|preview|ea|incubating|dev)|[.-]m\d+\b/i;
const tag = (text, name) => new RegExp(`<${name}>\\s*([^<\\s]+)\\s*</${name}>`).exec(text)?.[1]; // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp -- name is a constant of this file

function add(found, id, version, file) {
  if (!version || version.includes("${") || !/^\d/.test(version)) return;
  const entry = found.get(id) ?? { versions: new Set(), files: new Set() };
  entry.versions.add(version);
  entry.files.add(file);
  found.set(id, entry);
}

/** Artifact versions declared in the repository: Map("group:artifact" → { versions, files }). */
export function declaredArtifacts(root) {
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
      const rel = relative(root, p).replace(/\\/g, "/");
      if (e.isDirectory()) {
        if (!SKIP.has(e.name) && depth < 8) visit(p, depth + 1);
      } else if (e.name === "pom.xml") {
        const xml = readFileSync(p, "utf8").replace(/<!--[\s\S]*?-->/g, "");
        const props = Object.fromEntries([...(/<properties>([\s\S]*?)<\/properties>/.exec(xml)?.[1] ?? "").matchAll(/<([\w.-]+)>\s*([^<\s]+)\s*<\/\1>/g)].map((m) => [m[1], m[2]]));
        for (const m of xml.matchAll(/<(dependency|parent|plugin)>([\s\S]*?)<\/\1>/g)) {
          const artifact = tag(m[2], "artifactId");
          const group = tag(m[2], "groupId") ?? (m[1] === "plugin" ? "org.apache.maven.plugins" : null);
          let version = tag(m[2], "version");
          const ref = /^\$\{([\w.-]+)\}$/.exec(version ?? "")?.[1];
          if (ref) version = props[ref];
          if (artifact && group) add(found, `${group}:${artifact}`, version, rel);
        }
      } else if (rel === "gradle/libs.versions.toml") {
        const toml = readFileSync(p, "utf8");
        const versions = Object.fromEntries([...(/\[versions\]([\s\S]*?)(?:\n\[|$)/.exec(toml)?.[1] ?? "").matchAll(/^\s*([\w.-]+)\s*=\s*"([^"]+)"/gm)].map((m) => [m[1], m[2]]));
        for (const line of toml.split(/\r?\n/)) {
          const module = /module\s*=\s*"([\w.-]+:[\w.-]+)"/.exec(line)?.[1] ?? (/group\s*=\s*"([\w.-]+)"\s*,\s*name\s*=\s*"([\w.-]+)"/.exec(line) ?? []).slice(1, 3).join(":");
          if (!module) continue;
          const version = /version\s*=\s*"([^"]+)"/.exec(line)?.[1] ?? versions[/version\.ref\s*=\s*"([\w.-]+)"/.exec(line)?.[1]];
          add(found, module, version, rel);
        }
      }
    }
  };
  visit(root, 0);
  return found;
}

const parse = (v) => {
  const m = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))?(.*)$/.exec(v);
  return m ? { parts: [m[1], m[2] ?? 0, m[3] ?? 0, m[4] ?? 0].map(Number), pre: PRE.test(m[5]) } : null;
};
export function compare(a, b) {
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 4; i++) if (pa.parts[i] !== pb.parts[i]) return pa.parts[i] - pb.parts[i];
  return a.localeCompare(b);
}
export const stable = (v) => Boolean(parse(v)) && !parse(v).pre;

/** Every version Maven Central lists for an artifact (maven-metadata.xml), or [] when it has none. */
export async function publishedVersions(id, fetchImpl = fetch) {
  const [group, artifact] = id.split(":");
  const res = await fetchImpl(`${CENTRAL}/${group.replaceAll(".", "/")}/${artifact}/maven-metadata.xml`);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`maven-metadata.xml returned ${res.status}`);
  return [...(await res.text()).matchAll(/<version>\s*([^<\s]+)\s*<\/version>/g)].map((m) => m[1]);
}

/** When a version was published: the Last-Modified header of its pom on Maven Central, or null. */
export async function publishedAt(id, version, fetchImpl = fetch) {
  const [group, artifact] = id.split(":");
  const res = await fetchImpl(`${CENTRAL}/${group.replaceAll(".", "/")}/${artifact}/${version}/${artifact}-${version}.pom`, { method: "HEAD" });
  const date = res.ok ? Date.parse(res.headers.get("last-modified") ?? "") : NaN;
  return Number.isFinite(date) ? date : null;
}

/** The newest stable version past the cooldown, within the current major and overall; newest first, so few requests. */
export async function eligible(id, current, { days = 14, now = Date.now(), fetchImpl = fetch } = {}) {
  const cutoff = now - days * DAY;
  const newer = (await publishedVersions(id, fetchImpl)).filter((v) => stable(v) && compare(v, current) >= 0).sort((a, b) => compare(b, a));
  const major = parse(current)?.parts[0];
  const out = { latest: newer[0] ?? null, sameMajor: null, any: null };
  for (const v of newer) {
    if (out.sameMajor && out.any) break;
    if (out.any && parse(v).parts[0] !== major) continue;
    const at = await publishedAt(id, v, fetchImpl);
    if (at === null || at > cutoff) continue;
    out.any ??= v;
    if (parse(v).parts[0] === major) out.sameMajor ??= v;
  }
  return out;
}

export async function report(root, { days = 14, now = Date.now(), fetchImpl = fetch } = {}) {
  const rows = [];
  for (const [id, { versions, files }] of [...declaredArtifacts(root)].sort(([a], [b]) => a.localeCompare(b))) {
    const current = [...versions].sort(compare).at(-1);
    try {
      const e = await eligible(id, current, { days, now, fetchImpl });
      const upgrade = (v) => (v && compare(v, current) > 0 ? v : null);
      rows.push({ id, current, latest: e.latest, sameMajor: upgrade(e.sameMajor), any: upgrade(e.any), files: [...files], mixed: versions.size > 1 ? [...versions] : undefined });
    } catch (err) {
      rows.push({ id, current, error: err.message, files: [...files] });
    }
  }
  return rows;
}

function render(rows, days) {
  const lines = [`Maven artifacts (cooldown ${days} days):`, ""];
  const w = Math.max(10, ...rows.map((r) => r.id.length));
  lines.push(`${"artifact".padEnd(w)}  ${"current".padEnd(12)} ${"latest".padEnd(12)} ${"same major".padEnd(12)} any major`);
  for (const r of rows) {
    if (r.error) {
      lines.push(`${r.id.padEnd(w)}  ${r.current.padEnd(12)} error: ${r.error}`);
      continue;
    }
    const wait = r.latest && compare(r.latest, r.current) > 0 && !r.sameMajor && !r.any ? "wait" : "-";
    lines.push(`${r.id.padEnd(w)}  ${r.current.padEnd(12)} ${(r.latest ?? "?").padEnd(12)} ${(r.sameMajor ?? wait).padEnd(12)} ${r.any ?? wait}`);
    if (r.mixed) lines.push(`${" ".repeat(w)}  note: several versions declared (${r.mixed.join(", ")}); manage it once in the parent pom or the version catalog`);
  }
  return lines.join("\n");
}

const isMain = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isMain) {
  const args = process.argv.slice(2);
  const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
  for (let i = 0; i < args.length; i++) {
    if (!["--target", "--days", "--json"].includes(args[i])) {
      console.error(`maven-cooldown: unknown argument ${args[i]}`);
      process.exit(2);
    }
    if (args[i] !== "--json") i++;
  }
  const days = Number(opt("--days", "14"));
  if (!Number.isFinite(days) || days < 0) {
    console.error("maven-cooldown: --days must be a number");
    process.exit(2);
  }
  try {
    const rows = await report(opt("--target", "."), { days });
    console.log(args.includes("--json") ? JSON.stringify(rows, null, 2) : render(rows, days));
  } catch (err) {
    console.error(`maven-cooldown: ${err.message}`);
    process.exit(1);
  }
}
