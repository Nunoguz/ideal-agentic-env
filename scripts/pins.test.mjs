import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkPins, syncPins } from "./pins.mjs";

const A = "a".repeat(40);
const B = "b".repeat(40);
const C = "c".repeat(40);

function repo(files) {
  const root = mkdtempSync(join(tmpdir(), "iae-pins-"));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  return root;
}

const TEMPLATE = "plugins/p/skills/s/templates/.github/workflows/ci.yml.tmpl";
const SCRIPT = "plugins/p/skills/s/scripts/scaffold.mjs";

test("shipped pins that match the repo workflows pass", () => {
  const root = repo({
    ".github/workflows/ci.yml": `steps:\n      - uses: actions/checkout@${A} # v7.0.1\n`,
    [TEMPLATE]: `steps:\n      - uses: actions/checkout@${A} # v7.0.1\n`,
    [SCRIPT]: `lines.push("      - uses: actions/checkout@${A} # v7.0.1");\n`,
  });
  try {
    assert.deepEqual(checkPins(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a drifted template or scaffold pin fails and sync rewrites it with the version comment", () => {
  const root = repo({
    ".github/workflows/ci.yml": `steps:\n      - uses: actions/checkout@${A} # v7.0.1\n      - uses: actions/cache/save@${C} # v4.2.0\n`,
    [TEMPLATE]: `steps:\n      - uses: actions/checkout@${B} # v5.1.0\n      - uses: actions/cache/restore@${B} # v4.0.0\n`,
    [SCRIPT]: `lines.push("      - uses: actions/checkout@${B} # v5.1.0", "        with:");\n`,
  });
  try {
    const errors = checkPins(root);
    assert.equal(errors.length, 3);
    assert.ok(errors.some((e) => /ci\.yml\.tmpl:2: actions\/checkout pin bbbbbbbbbbbb differs/.test(e)), errors.join("\n"));
    assert.deepEqual(syncPins(root).sort(), [SCRIPT, TEMPLATE]);
    assert.equal(
      readFileSync(join(root, TEMPLATE), "utf8"),
      `steps:\n      - uses: actions/checkout@${A} # v7.0.1\n      - uses: actions/cache/restore@${C} # v4.2.0\n`,
    );
    assert.equal(readFileSync(join(root, SCRIPT), "utf8"), `lines.push("      - uses: actions/checkout@${A} # v7.0.1", "        with:");\n`);
    assert.deepEqual(checkPins(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an action used only by shipped content must be in the pin registry", () => {
  const root = repo({
    ".github/workflows/ci.yml": `steps:\n      - uses: actions/checkout@${A} # v7.0.1\n`,
    [SCRIPT]: `lines.push("      - uses: actions/setup-go@${B} # v6.0.0");\n`,
  });
  try {
    const [error] = checkPins(root);
    assert.match(error, /actions\/setup-go is not pinned in \.github\/workflows\/; add it to action-pins\.yml/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("two different pins for one action inside the repo workflows fail", () => {
  const root = repo({
    ".github/workflows/a.yml": `      - uses: actions/checkout@${A} # v7.0.1\n`,
    ".github/workflows/b.yml": `      - uses: actions/checkout@${B} # v5.1.0\n`,
  });
  try {
    const [error] = checkPins(root);
    assert.match(error, /use one pin per action/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
