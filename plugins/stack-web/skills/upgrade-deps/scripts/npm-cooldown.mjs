#!/usr/bin/env node
// Lists outdated npm dependencies and, for each, the newest stable version that has been public for at
// least the cooldown period (14 days by default, the same cooldown Dependabot uses). A release that was
// pulled or found malicious usually disappears within that window.
// Shared file: the source of truth is shared/npm-cooldown.mjs in the marketplace repo (npm run sync).
//
//   node npm-cooldown.mjs [--target <dir>] [--days 14] [--json]
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const NAME_RE = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i;
const STABLE_RE = /^(\d+)\.(\d+)\.(\d+)$/;

export function parseVersion(v) {
  const m = STABLE_RE.exec(String(v ?? ""));
  return m ? m.slice(1, 4).map(Number) : null;
}

export function compare(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/**
 * The newest stable version in `times` (npm's `time` map: version → ISO date) that is newer than
 * `current`, not newer than `latest`, and published at least `days` before `now`. Null when none is.
 */
export function eligibleVersion(times, current, latest, now = Date.now(), days = 14) {
  const cur = parseVersion(current);
  const top = parseVersion(latest);
  const cutoff = now - days * 86_400_000;
  let best = null;
  for (const [version, date] of Object.entries(times ?? {})) {
    const v = parseVersion(version);
    if (!v || (cur && compare(v, cur) <= 0) || (top && compare(v, top) > 0)) continue;
    if (Date.parse(date) > cutoff) continue;
    if (!best || compare(v, parseVersion(best)) > 0) best = version;
  }
  return best;
}

function npm(args, cwd) {
  // npm is npm.cmd on Windows, which needs a shell; every argument is fixed or a validated package name.
  return spawnSync("npm", args, { cwd, encoding: "utf8", windowsHide: true, timeout: 120000, shell: process.platform === "win32" }); // nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true -- fixed arguments plus package names checked against NAME_RE
}

/** `npm outdated --json` output (object, values may be arrays per workspace) → flat rows. */
export function outdatedRows(json) {
  const rows = [];
  for (const [name, entry] of Object.entries(json ?? {})) {
    for (const e of Array.isArray(entry) ? entry : [entry]) rows.push({ name, current: e.current, wanted: e.wanted, latest: e.latest, where: e.dependent ?? e.location ?? "" });
  }
  return rows;
}

export function report(rows, { days, now = Date.now(), timesOf }) {
  return rows.map((r) => {
    const eligible = NAME_RE.test(r.name) ? eligibleVersion(timesOf(r.name), r.current, r.latest, now, days) : null;
    const cur = parseVersion(r.current);
    const el = parseVersion(eligible);
    return { ...r, eligible, major: Boolean(cur && el && el[0] > cur[0]) };
  });
}

function main() {
  const args = process.argv.slice(2);
  const get = (flag, fallback) => {
    const i = args.indexOf(flag);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
  };
  const target = resolve(get("--target", "."));
  const days = Number(get("--days", "14"));
  if (!Number.isFinite(days) || days < 0) throw new Error("--days must be a non-negative number");
  const out = npm(["outdated", "--json", "--workspaces", "--include-workspace-root"], target);
  if (out.error) throw out.error;
  const json = JSON.parse(out.stdout.trim() || "{}");
  if (json.error) throw new Error(json.error.summary ?? "npm outdated failed");
  const timesOf = (name) => {
    const r = npm(["view", name, "time", "--json"], target);
    try {
      return JSON.parse(r.stdout || "{}");
    } catch {
      return {};
    }
  };
  const rows = report(outdatedRows(json), { days, timesOf });
  if (args.includes("--json")) return console.log(JSON.stringify(rows, null, 2));
  if (!rows.length) return console.log("Everything is up to date.");
  console.log(`cooldown: ${days} days\n`);
  for (const r of rows) {
    const verdict = r.eligible ? `→ ${r.eligible}${r.major ? "  (MAJOR: read the changelog, upgrade alone)" : ""}` : "→ wait (no version past the cooldown)";
    console.log(`  ${r.name.padEnd(36)} ${String(r.current ?? "-").padEnd(10)} latest ${String(r.latest).padEnd(10)} ${verdict}${r.where ? `  [${r.where}]` : ""}`);
  }
}

const isMain = (() => {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();
if (isMain) {
  try {
    main();
  } catch (err) {
    console.error(`npm-cooldown: ${err.message}`);
    process.exit(1);
  }
}
