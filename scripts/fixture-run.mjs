#!/usr/bin/env node
// Runs one fixture end to end, as a new project would: copy fixtures/<name> to a temporary directory, run
// core:init, governance:setup and the fixture's stack setups (the shipped scripts, not copies), check that a
// second run of every setup changes nothing, install, then `node scripts/verify.mjs --full`.
// fixtures/<name>/fixture.json: { "setups": ["stack-web"], "install": ["npm ci"], "expect": { "profiles": { "stack-web": ["nuxt"] } },
//   "gates": ["dependency"] }   gates: governance's dependency gate (OSV-Scanner vulnerabilities and licenses) after verify
//
//   node scripts/fixture-run.mjs <name> [--keep] [--fast]
//
//   --fast  run verify --fast instead of --full (locally, when a service such as SQL Server is not available)
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_COPY = new Set(["node_modules", ".nuxt", ".output", "bin", "obj", ".expo", "dist", "target"]);

// The fixture is its own repository: the marketplace PR's GitHub event (base ref, event name) does not apply to it.
const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GITHUB_(BASE_REF|HEAD_REF|EVENT_NAME|EVENT_PATH|REF|REF_NAME|SHA)$/.test(k)));

function sh(cmd, args, cwd, { capture = false } = {}) {
  const r = spawnSync(cmd, args, { cwd, env: ENV, encoding: "utf8", stdio: capture ? "pipe" : "inherit", shell: process.platform === "win32" && !capture, windowsHide: true }); // nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true -- fixed commands from this repository's fixture.json
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed (exit ${r.status})${capture ? `\n${r.stderr || r.stdout}` : ""}`);
  return r.stdout;
}

const setupScript = (plugin) => (plugin === "governance" ? join(REPO, "plugins/governance/skills/setup/scripts/setup.mjs") : join(REPO, "plugins", plugin, "skills/setup/scripts/setup.mjs"));

export function runFixture(name, { keep = false, fast = false } = {}) {
  const src = join(REPO, "fixtures", name);
  const spec = JSON.parse(readFileSync(join(src, "fixture.json"), "utf8"));
  const dir = mkdtempSync(join(process.env.RUNNER_TEMP || tmpdir(), `iae-fixture-${name}-`));
  cpSync(src, dir, { recursive: true, filter: (p) => !SKIP_COPY.has(p.split(/[\\/]/).pop()) });
  try {
    const git = (...a) => sh("git", ["-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", ...a], dir, { capture: true });
    git("init", "-q", "-b", "main");
    git("add", "-A");
    git("commit", "-q", "-m", "fixture");
    console.log(`\n# fixture ${name} in ${dir}`);
    sh(process.execPath, [join(REPO, "plugins/core/skills/init/scripts/scaffold.mjs"), "--target", ".", "--owner", "@fixture"], dir);
    const setups = ["governance", ...spec.setups];
    for (const plugin of setups) sh(process.execPath, [setupScript(plugin), "--target", ".", ...(plugin === "governance" ? ["--default-branch", "main"] : [])], dir);

    // Idempotency: a second run of every setup must only skip.
    for (const plugin of setups) {
      const out = JSON.parse(sh(process.execPath, [setupScript(plugin), "--target", ".", "--dry-run", "--json", ...(plugin === "governance" ? ["--default-branch", "main"] : [])], dir, { capture: true }));
      const changes = out.actions.filter((a) => a.action !== "skip");
      if (changes.length) throw new Error(`${plugin} setup is not idempotent: ${changes.map((a) => `${a.action} ${a.rel}`).join(", ")}`);
      const want = spec.expect?.profiles?.[plugin];
      if (want && JSON.stringify(out.profiles.map((p) => p.split(" ")[0])) !== JSON.stringify(want)) throw new Error(`${plugin} detected ${out.profiles.join(", ")}, expected ${want.join(", ")}`);
    }
    for (const cmd of spec.install ?? []) sh(cmd.split(" ")[0], cmd.split(" ").slice(1), dir);
    sh(process.execPath, ["scripts/verify.mjs", fast ? "--fast" : "--full"], dir);
    for (const gate of spec.gates ?? []) {
      if (gate !== "dependency") throw new Error(`unknown gate ${gate}`);
      const scanner = process.env.OSV_SCANNER || "osv-scanner";
      if (spawnSync(scanner, ["--version"], { encoding: "utf8", windowsHide: true }).status !== 0) {
        if (process.env.CI) throw new Error("the dependency gate needs osv-scanner on PATH (see .github/workflows/fixtures.yml)");
        console.log("\n# dependency gate skipped: osv-scanner is not installed");
        continue;
      }
      sh(process.execPath, [".github/scripts/dependency-gate.mjs"], dir);
    }
    console.log(`\n# fixture ${name}: green`);
  } finally {
    if (!keep) rmSync(dir, { recursive: true, force: true });
    else console.log(`kept ${dir}`);
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [name, ...rest] = process.argv.slice(2);
  try {
    if (!name || !existsSync(join(REPO, "fixtures", name, "fixture.json"))) throw new Error(`usage: node scripts/fixture-run.mjs <name>; fixtures: fixtures/*/fixture.json`);
    runFixture(name, { keep: rest.includes("--keep"), fast: rest.includes("--fast") });
  } catch (err) {
    console.error(`fixture-run: ${err.message}`);
    process.exit(1);
  }
}
