import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const CONFIG_PATH = ".claude/ideal-agentic-env.json";

// Defaults always apply. Project config can only ADD to safety lists, never remove from them,
// so a broken or hostile config cannot switch protection off.
export const DEFAULTS = Object.freeze({
  protectedPaths: [".claude/**", ".github/**", ".githooks/**", "scripts/verify.mjs", "CLAUDE.md"],
  migrations: ["**/migrations/**", "**/db/migration/**", "**/alembic/versions/**"],
  // Files inside migration folders that the migration tool itself rewrites, or that are re-applied on
  // change by design. They are not immutable once merged.
  migrationsMutable: [
    "**/meta/_journal.json",
    "**/migration_lock.toml",
    "**/*ModelSnapshot.cs",
    "**/R__*.sql",
    "**/__pycache__/**",
  ],
  secretFiles: [
    "**/.env",
    "**/.env.*",
    "**/*.pem",
    "**/*.key",
    "**/*.p12",
    "**/*.pfx",
    "**/*.jks",
    "**/*.keystore",
    "**/id_rsa",
    "**/id_ecdsa",
    "**/id_ed25519",
    "**/.ssh/*",
    "**/.aws/credentials",
    "**/.netrc",
  ],
  secretFilesAllow: ["**/.env.example", "**/.env.sample", "**/.env.template", "**/*.pub", "**/.ssh/known_hosts", "**/.ssh/config"],
  format: [],
  verify: { timeoutSec: 240 },
});

// A project rule for shell-guard (added by a plugin's setup, for example a cloud plugin's destructive CLI
// commands): a case-insensitive regular expression over one command segment ("program arg arg").
const isGuard = (g) => g && typeof g.pattern === "string" && g.pattern.length <= 300 && ["ask", "deny"].includes(g.decision) && typeof g.reason === "string";

export function loadConfig(root) {
  const file = join(root, CONFIG_PATH);
  let user = {};
  if (existsSync(file)) {
    try {
      user = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      user = {};
    }
  }
  const list = (key) => [...DEFAULTS[key], ...(Array.isArray(user[key]) ? user[key].filter((x) => typeof x === "string") : [])];
  return {
    protectedPaths: list("protectedPaths"),
    migrations: list("migrations"),
    migrationsMutable: list("migrationsMutable"),
    secretFiles: list("secretFiles"),
    secretFilesAllow: DEFAULTS.secretFilesAllow,
    format: Array.isArray(user.format) ? user.format.filter((f) => f && typeof f.glob === "string" && typeof f.run === "string") : [],
    verify: { ...DEFAULTS.verify, ...(user.verify && typeof user.verify === "object" ? user.verify : {}) },
    guardedCommands: Array.isArray(user.guardedCommands) ? user.guardedCommands.filter(isGuard) : [],
  };
}
