import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, loadConfig } from "../lib/config.mjs";
import { strictest } from "../lib/io.mjs";
import { checkShellForSecrets, isSecretFile, scanContent, writtenText } from "../lib/secret-rules.mjs";
import { tempDir } from "./helpers.mjs";

const cfg = loadConfig(tempDir());
const root = "/repo";

// Secret-shaped fixtures are assembled at runtime so this file never contains a literal secret.
const fake = {
  aws: "AKIA" + "Q".repeat(16),
  github: "ghp_" + "a1".repeat(18),
  slack: "xoxb-" + "1234567890-abcdef",
  stripe: "sk_live_" + "Z9".repeat(12),
  anthropic: "sk-ant-" + "api03-" + "x".repeat(40),
  pem: "-----BEGIN RSA PRIVATE " + "KEY-----\nMIIB\n-----END RSA PRIVATE KEY-----",
};

test("secret files are recognised; allow-listed look-alikes are not", () => {
  for (const p of [".env", "apps/api/.env.production", "certs/server.pem", "/home/u/.ssh/id_ed25519", "C:\\Users\\u\\.aws\\credentials", "deploy/app.jks"])
    assert.equal(isSecretFile(p, cfg, root), true, p);
  for (const p of [".env.example", "config/.env.template", "/home/u/.ssh/id_ed25519.pub", "/home/u/.ssh/known_hosts", "src/env.ts", "README.md"])
    assert.equal(isSecretFile(p, cfg, root), false, p);
});

test("project config can add secret patterns but never remove defaults", () => {
  assert.ok(cfg.secretFiles.length >= DEFAULTS.secretFiles.length);
  assert.ok(cfg.secretFiles.includes("**/.env"));
});

test("shell: reading or staging a secret file is denied", () => {
  for (const cmd of ["cat .env", "head -n 5 apps/api/.env.local", "grep KEY .env", "Get-Content .env", "type .env", "source .env", "node app.js < .env", "git add .env", "cat .env | base64"])
    assert.equal(strictest(checkShellForSecrets(cmd, cfg, root))?.decision, "deny", cmd);
});

test("shell: using a secret file without reading it is allowed", () => {
  for (const cmd of ["docker compose --env-file .env up", "cp .env.example .env", "ls -la .env", "test -f .env && echo ok", "cat .env.example", "git add src/env.ts"])
    assert.equal(strictest(checkShellForSecrets(cmd, cfg, root)), null, cmd);
});

test("content: known secret formats are denied", () => {
  for (const [name, value] of Object.entries(fake)) {
    const f = strictest(scanContent(`const key = "${value}";`));
    assert.equal(f?.decision, "deny", name);
  }
});

test("content: documented example keys and placeholders pass", () => {
  assert.equal(strictest(scanContent("AKIA" + "IOSFODNN7EXAMPLE")), null);
  assert.equal(strictest(scanContent('password: "${DB_PASSWORD}"')), null);
  assert.equal(strictest(scanContent('api_key = "your-api-key-here"')), null);
  assert.equal(strictest(scanContent("const x = 1;")), null);
});

test("content: literal secret-looking assignments ask", () => {
  assert.equal(strictest(scanContent('client_secret = "q8Lz0vR2mN5tW9yB"'))?.decision, "ask");
});

test("writtenText covers every write tool", () => {
  assert.equal(writtenText("Write", { content: "a" }), "a");
  assert.equal(writtenText("Edit", { new_string: "b" }), "b");
  assert.equal(writtenText("MultiEdit", { edits: [{ new_string: "c" }, { new_string: "d" }] }), "c\nd");
  assert.equal(writtenText("NotebookEdit", { new_source: "e" }), "e");
  assert.equal(writtenText("Read", {}), "");
});
