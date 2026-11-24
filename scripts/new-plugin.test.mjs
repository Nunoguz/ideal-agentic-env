import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { apply, plan } from "./new-plugin.mjs";
import { validateRepo } from "./validate.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

/** A minimal marketplace with the cloud template and the shared setup sources, and nothing else. */
function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "iae-newplugin-"));
  mkdirSync(join(root, ".claude-plugin"), { recursive: true });
  writeFileSync(join(root, ".claude-plugin", "marketplace.json"), JSON.stringify({ name: "test-mp", owner: { name: "t" }, description: "d", plugins: [] }));
  cpSync(join(REPO, "templates", "cloud-plugin"), join(root, "templates", "cloud-plugin"), { recursive: true });
  mkdirSync(join(root, "shared"), { recursive: true });
  for (const f of ["scaffold-lib.mjs", "stack-lib.mjs", "stack-setup.mjs"]) cpSync(join(REPO, "shared", f), join(root, "shared", f));
  writeFileSync(join(root, "shared", "manifest.json"), JSON.stringify({ files: {} }));
  return root;
}

test("the cloud skeleton is created, registered and passes validation as a 0.0.1 plugin", () => {
  const root = sandbox();
  const p = plan({ root, kind: "cloud", name: "cloud-aws", provider: "AWS", cli: "aws" });
  apply(root, p, "cloud-aws", "AWS");
  const mp = JSON.parse(readFileSync(join(root, ".claude-plugin", "marketplace.json"), "utf8"));
  assert.deepEqual(mp.plugins.map((x) => [x.name, x.source, x.category]), [["cloud-aws", "./plugins/cloud-aws", "cloud"]]);
  assert.match(readFileSync(join(root, "plugins/cloud-aws/skills/iac/SKILL.md"), "utf8"), /^---\nname: iac\n/);
  assert.ok(readFileSync(join(root, "plugins/cloud-aws/skills/setup/scripts/setup.mjs"), "utf8").length > 100, "shared setup copied");
  const { errors } = validateRepo(root);
  assert.deepEqual(errors, []);
});

test("a released cloud plugin must guard its destructive commands; bad names and duplicates are refused", () => {
  const root = sandbox();
  apply(root, plan({ root, kind: "cloud", name: "cloud-gcp", provider: "Google Cloud", cli: "gcloud" }), "cloud-gcp", "Google Cloud");
  const pj = join(root, "plugins/cloud-gcp/.claude-plugin/plugin.json");
  writeFileSync(pj, readFileSync(pj, "utf8").replace('"0.0.1"', '"0.1.0"'));
  writeFileSync(join(root, "plugins/cloud-gcp/CHANGELOG.md"), "# Changelog\n\n## 0.1.0\n\n- x\n");
  assert.ok(validateRepo(root).errors.some((e) => /config\.guardedCommands/.test(e)));
  const sj = join(root, "plugins/cloud-gcp/stack.json");
  const contract = JSON.parse(readFileSync(sj, "utf8"));
  contract.config.guardedCommands = [{ pattern: "^gcloud .*\\bdelete\\b", decision: "ask", reason: "deleting a Google Cloud resource" }];
  writeFileSync(sj, JSON.stringify(contract));
  assert.ok(!validateRepo(root).errors.some((e) => /cloud-gcp/.test(e)), validateRepo(root).errors.join("\n"));
  assert.throws(() => plan({ root, kind: "cloud", name: "cloud-gcp", provider: "GCP", cli: "x" }), /already exists/);
  assert.throws(() => plan({ root, kind: "cloud", name: "aws", provider: "AWS", cli: "aws" }), /start with cloud-/);
  assert.throws(() => plan({ root, kind: "cloud", name: "cloud-x", provider: "{{bad}}", cli: "x" }), /display name/);
  assert.throws(() => plan({ root, kind: "saas", name: "cloud-x", provider: "Xx", cli: "x" }), /--kind/);
});
