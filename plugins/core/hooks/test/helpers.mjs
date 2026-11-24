import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const HOOKS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Run a hook script with a JSON (or raw string) stdin; returns { status, json, stdout, stderr }. */
export function runHook(script, input, { env = {}, cwd } = {}) {
  const r = spawnSync(process.execPath, [join(HOOKS_DIR, script)], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    encoding: "utf8",
    cwd,
    env: { ...process.env, ...env },
    timeout: 60000,
  });
  let json = null;
  try {
    json = r.stdout.trim() ? JSON.parse(r.stdout) : null;
  } catch {
    json = null;
  }
  return { status: r.status, json, stdout: r.stdout, stderr: r.stderr };
}

export function decisionOf(result) {
  return result.json?.hookSpecificOutput?.permissionDecision ?? "allow";
}

/** A temporary project. By default it is managed (has .claude/ideal-agentic-env.json); core is dormant otherwise. */
export function tempDir(prefix = "iae-core-", { managed = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  if (managed && !prefix.startsWith("iae-data-")) {
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(join(root, ".claude", "ideal-agentic-env.json"), "{}\n");
  }
  return root;
}

const GIT_ID = ["-c", "user.name=test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false"];

export function git(cwd, ...args) {
  const r = spawnSync("git", [...GIT_ID, ...args], { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout.trim();
}

export function writeFile(root, rel, content) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
  return p;
}

/** A git repo on `main` with one commit containing `files`. */
export function makeRepo(files = { "README.md": "# t\n" }) {
  const root = tempDir("iae-repo-");
  git(root, "init", "-q", "-b", "main");
  for (const [rel, content] of Object.entries(files)) writeFile(root, rel, content);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "init");
  return root;
}
