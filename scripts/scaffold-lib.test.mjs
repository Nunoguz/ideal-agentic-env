// Tests for the managed-file part of shared/scaffold-lib.mjs (ADR-0008). The plugin copies are identical
// (npm run validate checks it), so testing the source covers them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contentHash, isManagedPath, planManaged, planTemplates, proposed, readMarker, withMarker } from "../shared/scaffold-lib.mjs";

const P = { name: "demo", version: "1.2.3" };

test("only CI scripts and workflows are managed", () => {
  assert.ok(isManagedPath(".github/scripts/x.mjs"));
  assert.ok(isManagedPath(".github/workflows/ci.yml"));
  for (const rel of [".github/dependabot.yml", ".github/ISSUE_TEMPLATE/a.yml", "docs/x.md", "scripts/verify.mjs"]) assert.ok(!isManagedPath(rel), rel);
});

test("the marker uses the file's comment syntax, follows a shebang, and round-trips", () => {
  const js = withMarker("a.mjs", "#!/usr/bin/env node\nconsole.log(1);\n", P);
  assert.match(js, /^#!\/usr\/bin\/env node\n\/\/ Managed by demo 1\.2\.3 \(ideal-agentic-env\)\./);
  const yml = withMarker("w.yml", "name: x\n", P);
  assert.match(yml, /^# Managed by demo 1\.2\.3/);
  assert.deepEqual(readMarker(yml), { plugin: "demo", version: "1.2.3", body: "name: x\n", edited: false });
  assert.equal(readMarker(yml.replace(/\n/g, "\r\n")).edited, false, "CRLF checkouts still match");
  assert.equal(readMarker(`${yml}extra: 1\n`).edited, true);
  assert.equal(readMarker(`a\nb\nc\n${yml}`), null, "only the first lines are searched");
  assert.equal(contentHash("a\r\nb"), contentHash("a\nb"));
});

test("planManaged covers every state of an existing file", () => {
  const body = "name: new\n";
  const states = {
    current: [withMarker("w.yml", body, { name: "demo", version: "0.9.0" }), {}, "skip", /up to date/],
    outdated: [withMarker("w.yml", "name: old\n", { name: "demo", version: "0.9.0" }), {}, "skip", /outdated \(0\.9\.0\)/],
    refreshed: [withMarker("w.yml", "name: old\n", { name: "demo", version: "0.9.0" }), { refresh: true }, "update", /0\.9\.0 -> 1\.2\.3/],
    edited: [`${withMarker("w.yml", "name: old\n", P)}x: 1\n`, { refresh: true }, "skip", /edited by hand/],
    adopted: [`${withMarker("w.yml", "name: old\n", P)}x: 1\n`, { adopt: ["w.yml"] }, "update", /--adopt/],
    foreign: [withMarker("w.yml", "name: old\n", { name: "other", version: "1.0.0" }), { refresh: true, adopt: ["w.yml"] }, "skip", /managed by other/],
    unmarked: ["name: legacy\n", { refresh: true }, "skip", /without a managed marker/],
    identical: [body, { refresh: true }, "update", /adds the managed marker/],
  };
  for (const [name, [existing, opts, action, note]] of Object.entries(states)) {
    const a = planManaged("w.yml", existing, body, P, opts);
    assert.equal(a.action, action, name);
    assert.match(a.note, note, name);
    if (action === "update") assert.equal(readMarker(a.content).body, body, name);
  }
});

test("planTemplates marks managed templates only when a plugin is given; proposed() serves --print", () => {
  const tpl = mkdtempSync(join(tmpdir(), "iae-tpl-"));
  mkdirSync(join(tpl, ".github", "scripts"), { recursive: true });
  writeFileSync(join(tpl, ".github", "scripts", "s.mjs.tmpl"), "// {{X}}\n");
  writeFileSync(join(tpl, "README.md.tmpl"), "# {{X}}\n");
  const root = mkdtempSync(join(tmpdir(), "iae-root-"));
  const plain = planTemplates(root, tpl, { X: "v" });
  assert.ok(plain.every((a) => a.action === "create" && !readMarker(a.content)));
  const managed = planTemplates(root, tpl, { X: "v" }, undefined, { plugin: P });
  assert.equal(readMarker(managed.find((a) => a.rel === ".github/scripts/s.mjs").content).body, "// v\n");
  assert.equal(readMarker(managed.find((a) => a.rel === "README.md").content), null);
  assert.match(proposed(root, managed, ".github/scripts/s.mjs"), /Managed by demo/);
  assert.throws(() => proposed(root, managed, "nope"), /does not write/);
});
