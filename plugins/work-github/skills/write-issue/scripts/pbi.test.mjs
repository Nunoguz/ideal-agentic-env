import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { create, find, list, set, slugify } from "./pbi.mjs";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "pbi.mjs");
const dir = () => mkdtempSync(join(tmpdir(), "iae-pbi-"));

test("slugs are ASCII, Turkish-aware and bounded", () => {
  assert.equal(slugify("Müşteri siparişlerini CSV olarak dışa aktarsın"), "musteri-siparislerini-csv-olarak-disa-aktarsin");
  assert.equal(slugify("!!!"), "item");
  assert.ok(slugify("a".repeat(100)).length <= 48);
});

test("new items are numbered sequentially from the template", () => {
  const root = dir();
  const a = create(root, { title: "Export orders as CSV" });
  const b = create(root, { title: "Fix login redirect", type: "bug", priority: "p1" });
  assert.deepEqual([a.id, b.id], ["PBI-0001", "PBI-0002"]);
  assert.equal(b.path, "docs/pbi/PBI-0002-fix-login-redirect.md");
  const text = readFileSync(join(root, b.path), "utf8");
  assert.match(text, /^# PBI-0002: Fix login redirect$/m);
  assert.match(text, /^- \*\*Type:\*\* bug$/m);
  assert.match(text, /^- \*\*Status:\*\* proposed$/m);
  assert.match(text, /^## Compliance impact$/m);
  assert.ok(!/\{\{[A-Z]+\}\}/.test(text));
});

test("list, find and set read and update the header lines only", () => {
  const root = dir();
  create(root, { title: "One" });
  create(root, { title: "Two" });
  set(root, "PBI-0002", { status: "ready", issue: "#42", plan: "docs/plans/2026-11-23-two.md" });
  assert.deepEqual(list(root, { status: "ready" }).map((i) => [i.id, i.issue, i.plan]), [["PBI-0002", "#42", "docs/plans/2026-11-23-two.md"]]);
  assert.equal(find(root, "2").id, "PBI-0002");
  assert.equal(find(root, "PBI-9999"), null);
  assert.throws(() => set(root, "PBI-0001", { status: "finished" }), /--status must be one of/);
  assert.throws(() => create(root, { title: "x", type: "epic" }), /--type must be one of/);
  assert.throws(() => create(root, { title: "  " }), /--title is required/);
});

test("set never lets a value inject extra lines", () => {
  const root = dir();
  const { path } = create(root, { title: "One" });
  set(root, "PBI-0001", { issue: "#1\n- **Status:** done" });
  const text = readFileSync(join(root, path), "utf8");
  assert.equal(text.match(/^- \*\*Status:\*\*/gm).length, 1);
  assert.match(text, /^- \*\*Status:\*\* proposed$/m);
});

test("CLI round trip", () => {
  const root = dir();
  const run = (...args) => spawnSync(process.execPath, [CLI, ...args, "--root", root], { encoding: "utf8" });
  assert.equal(run("new", "--title", "Add audit events", "--type", "feature").stdout.trim(), "docs/pbi/PBI-0001-add-audit-events.md");
  assert.equal(run("set", "PBI-0001", "--status", "in-progress").status, 0);
  assert.match(run("list").stdout, /PBI-0001 {2}in-progress {1}p2 {2}Add audit events/);
  assert.equal(JSON.parse(run("list", "--json").stdout)[0].status, "in-progress");
  assert.equal(run("path", "PBI-0001").stdout.trim(), "docs/pbi/PBI-0001-add-audit-events.md");
  const bad = run("bogus");
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /usage/);
  writeFileSync(join(root, "docs/pbi/notes.md"), "ignored\n");
  assert.equal(JSON.parse(run("list", "--json").stdout).length, 1, "non-PBI files are ignored");
});
