import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateRepo, frontmatter, unpinnedActions } from "./validate.mjs";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");

function fixture({ marketplace, plugins = {} }) {
  const root = mkdtempSync(join(tmpdir(), "iae-validate-"));
  mkdirSync(join(root, ".claude-plugin"));
  writeFileSync(join(root, ".claude-plugin", "marketplace.json"), JSON.stringify(marketplace));
  for (const [name, files] of Object.entries(plugins)) {
    for (const [rel, content] of Object.entries(files)) {
      const p = join(root, "plugins", name, rel);
      mkdirSync(resolve(p, ".."), { recursive: true });
      writeFileSync(p, typeof content === "string" ? content : JSON.stringify(content));
    }
  }
  return root;
}

const okPlugin = (name, extra = {}) => ({
  ".claude-plugin/plugin.json": { name, version: "1.0.0", description: "d" },
  "README.md": "# r\n\n> **Durum:** Stabil, 1.0.0.\n",
  "CHANGELOG.md": "## 1.0.0\n",
  ...extra,
});

const mp = (plugins, overrides = {}) => ({
  name: "test-mp",
  description: "d",
  owner: { name: "o" },
  plugins,
  ...overrides,
});

function run(spec) {
  const root = fixture(spec);
  try {
    return validateRepo(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("this repository passes validation", () => {
  const { errors } = validateRepo(REPO_ROOT);
  assert.deepEqual(errors, []);
});

test("valid minimal marketplace passes", () => {
  const { errors } = run({
    marketplace: mp([{ name: "a", source: "./plugins/a", description: "d" }]),
    plugins: { a: okPlugin("a") },
  });
  assert.deepEqual(errors, []);
});

test("reserved marketplace and plugin names are rejected", () => {
  const { errors } = run({
    marketplace: mp([{ name: "claude-x", source: "./plugins/claude-x" }], { name: "claude-code-plugins" }),
    plugins: { "claude-x": okPlugin("claude-x") },
  });
  assert.ok(errors.some((e) => e.includes('"claude-code-plugins" is reserved')));
  assert.ok(errors.some((e) => e.includes('"claude-x" is reserved')));
});

test("manifest name must equal entry name", () => {
  const { errors } = run({
    marketplace: mp([{ name: "a", source: "./plugins/a" }]),
    plugins: { a: okPlugin("b") },
  });
  assert.ok(errors.some((e) => e.includes("must equal marketplace entry name")));
});

test("version in both entry and plugin.json is rejected", () => {
  const { errors } = run({
    marketplace: mp([{ name: "a", source: "./plugins/a", version: "1.0.0" }]),
    plugins: { a: okPlugin("a") },
  });
  assert.ok(errors.some((e) => e.includes("set in both")));
});

test("source escaping the root is rejected", () => {
  const { errors } = run({ marketplace: mp([{ name: "a", source: "./plugins/../x" }]) });
  assert.ok(errors.some((e) => e.includes("must not contain ..")));
});

test("unlisted plugin directory is an orphan", () => {
  const { errors } = run({
    marketplace: mp([{ name: "a", source: "./plugins/a" }]),
    plugins: { a: okPlugin("a"), b: okPlugin("b") },
  });
  assert.ok(errors.some((e) => e.includes("plugins/b") && e.includes("not listed")));
});

test("changelog must contain the current version", () => {
  const { errors } = run({
    marketplace: mp([{ name: "a", source: "./plugins/a" }]),
    plugins: { a: okPlugin("a", { "CHANGELOG.md": "## 0.9.0\n" }) },
  });
  assert.ok(errors.some((e) => e.includes('"## 1.0.0"')));
});

test("CLAUDE.md inside a plugin is rejected", () => {
  const { errors } = run({
    marketplace: mp([{ name: "a", source: "./plugins/a" }]),
    plugins: { a: okPlugin("a", { "CLAUDE.md": "x" }) },
  });
  assert.ok(errors.some((e) => e.includes("never loaded")));
});

test("hooks.json without top-level hooks key is rejected", () => {
  const { errors } = run({
    marketplace: mp([{ name: "a", source: "./plugins/a" }]),
    plugins: { a: okPlugin("a", { "hooks/hooks.json": { PreToolUse: [] } }) },
  });
  assert.ok(errors.some((e) => e.includes('top-level "hooks" key')));
});

test("unquoted CLAUDE_PLUGIN_ROOT warns", () => {
  const hooks = { hooks: { Stop: [{ hooks: [{ type: "command", command: "${CLAUDE_PLUGIN_ROOT}/x.sh" }] }] } };
  const { warnings } = run({
    marketplace: mp([{ name: "a", source: "./plugins/a" }]),
    plugins: { a: okPlugin("a", { "hooks/hooks.json": hooks }) },
  });
  assert.ok(warnings.some((w) => w.includes("quote")));
});

test("skill frontmatter name must match directory", () => {
  const { errors } = run({
    marketplace: mp([{ name: "a", source: "./plugins/a" }]),
    plugins: { a: okPlugin("a", { "skills/plan/SKILL.md": "---\nname: other\ndescription: x\n---\n" }) },
  });
  assert.ok(errors.some((e) => e.includes('must equal directory "plan"')));
});

test("frontmatter parses quoted and plain values", () => {
  assert.deepEqual(frontmatter('---\nname: plan\ndescription: "Use when: planning"\n---\nbody'), {
    name: "plan",
    description: "Use when: planning",
  });
  assert.equal(frontmatter("no frontmatter"), null);
});

test("shared files must match their vendored copies", () => {
  const root = fixture({
    marketplace: mp([{ name: "a", source: "./plugins/a" }]),
    plugins: { a: okPlugin("a", { "hooks/lib/x.mjs": "export const x = 2;\n" }) },
  });
  try {
    mkdirSync(join(root, "shared"));
    writeFileSync(join(root, "shared", "x.mjs"), "export const x = 1;\n");
    writeFileSync(join(root, "shared", "manifest.json"), JSON.stringify({ files: { "x.mjs": ["plugins/a/hooks/lib/x.mjs", "plugins/a/missing.mjs"] } }));
    const { errors } = validateRepo(root);
    assert.ok(errors.some((e) => e.includes("plugins/a/hooks/lib/x.mjs") && e.includes("differs")));
    assert.ok(errors.some((e) => e.includes("plugins/a/missing.mjs") && e.includes("missing copy")));
    writeFileSync(join(root, "plugins", "a", "hooks", "lib", "x.mjs"), "export const x = 1;\r\n");
    writeFileSync(join(root, "plugins", "a", "missing.mjs"), "export const x = 1;\n");
    assert.deepEqual(validateRepo(root).errors, [], "CRLF checkouts are not drift");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("unquoted YAML comment markers and colons in frontmatter are rejected", () => {
  const { errors } = run({
    marketplace: mp([{ name: "a", source: "./plugins/a" }]),
    plugins: {
      a: okPlugin("a", {
        "skills/take/SKILL.md": "---\nname: take\ndescription: Use when the user says take issue #N\n---\n",
        "skills/other/SKILL.md": "---\nname: other\ndescription: Use when: always\n---\n",
        "skills/quoted/SKILL.md": '---\nname: quoted\ndescription: "Use for issue #N: quoted is fine"\n---\n',
      }),
    },
  });
  assert.ok(errors.some((e) => e.includes("skills/take/") && e.includes("YAML comment")));
  assert.ok(errors.some((e) => e.includes("skills/other/") && e.includes("invalid YAML")));
  assert.ok(!errors.some((e) => e.includes("skills/quoted/")));
});

test("workflow actions must be pinned to a full commit SHA", () => {
  const text = [
    "    steps:",
    "      - uses: actions/checkout@v5",
    "      - uses: actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444 # v5.0.0",
    '      - uses: "pnpm/action-setup@main"',
    "      - uses: ./.github/actions/local",
    "      - uses: docker://alpine:3",
  ].join("\n");
  assert.deepEqual(unpinnedActions(text), [
    { ref: "actions/checkout@v5", line: 2 },
    { ref: "pnpm/action-setup@main", line: 4 },
  ]);
});

// ---------- stack contract and context budget ----------

const skill = (name, description, extra = "") => `---\nname: ${name}\ndescription: ${description}\n${extra}---\n\n# ${name}\n`;
const stackPlugin = (name, overrides = {}) =>
  okPlugin(name, {
    "stack.json": { profiles: { base: { paths: ["**/*.ts"], rules: ["base.md"] } }, lsp: { binary: "x-ls" } },
    "rules/base.md": "# rules\n",
    ".lsp.json": { x: { command: "x-ls", extensionToLanguage: { ".ts": "typescript" } } },
    "skills/setup/SKILL.md": skill("setup", "Set up.", "disable-model-invocation: true\n"),
    "skills/setup/scripts/setup.mjs": "// setup\n",
    "skills/scaffold/SKILL.md": skill("scaffold", "Scaffold.", "disable-model-invocation: true\n"),
    "skills/test/SKILL.md": skill("test", "Test."),
    "skills/upgrade-deps/SKILL.md": skill("upgrade-deps", "Upgrade.", "disable-model-invocation: true\n"),
    ...overrides,
  });
const runOne = (name, files) => run({ marketplace: mp([{ name, source: `./plugins/${name}`, description: "d" }]), plugins: { [name]: files } });

test("a complete stack plugin passes", () => {
  assert.deepEqual(runOne("stack-x", stackPlugin("stack-x")).errors, []);
});

test("a released stack plugin without stack.json fails; a 0.0.x skeleton is exempt", () => {
  const released = okPlugin("stack-y");
  assert.match(runOne("stack-y", released).errors.join("\n"), /need a stack\.json contract/);
  const skeleton = { ...okPlugin("stack-y"), ".claude-plugin/plugin.json": { name: "stack-y", version: "0.0.1", description: "d" }, "CHANGELOG.md": "## 0.0.1\n", "README.md": "# s\n\n> **Durum:** Deneysel, iskelet.\n" };
  assert.deepEqual(runOne("stack-y", skeleton).errors.filter((e) => !/\[experimental\]/.test(e)), []);
});

test("stack contract errors: missing rule file, orphan rule, missing skills, model-invocable setup", () => {
  const files = stackPlugin("stack-z", {
    "stack.json": { profiles: { base: { paths: ["**/*.ts"], rules: ["missing.md"] } }, lsp: { binary: "x" } },
    "rules/orphan.md": "# o\n",
    "skills/setup/SKILL.md": skill("setup", "Set up."),
  });
  delete files["skills/upgrade-deps/SKILL.md"];
  const text = runOne("stack-z", files).errors.join("\n");
  assert.match(text, /rule rules\/missing\.md does not exist/);
  assert.match(text, /orphan\.md: not used by any profile/);
  assert.match(text, /need the upgrade-deps skill/);
  assert.match(text, /set disable-model-invocation: true/);
});

test("the always-on budget counts model-invocable skills and agents only", () => {
  const long = "x".repeat(1020);
  const files = okPlugin("big", {
    "skills/a/SKILL.md": skill("a", long),
    "skills/b/SKILL.md": skill("b", long),
    "skills/c/SKILL.md": skill("c", long),
    "skills/hidden/SKILL.md": skill("hidden", long, "disable-model-invocation: true\n"),
    "agents/r.md": `---\nname: r\ndescription: ${long}\n---\n`,
  });
  const { errors, budget } = runOne("big", files);
  assert.equal(budget.big.descriptions, Math.ceil((4 * 1020 + 4) / 4));
  assert.match(errors.join("\n"), /always-on skill and agent descriptions cost ~1021 tokens \(limit 900\)/);
  delete files["agents/r.md"];
  assert.deepEqual(runOne("big", files).errors, []);
});

test("maturity (ADR-0012): 0.x is tagged experimental in the catalog and the README; 1.x is not", () => {
  const young = (readme) => okPlugin("a", { ".claude-plugin/plugin.json": { name: "a", version: "0.3.0", description: "d" }, "CHANGELOG.md": "## 0.3.0\n", "README.md": readme });
  const untagged = run({ marketplace: mp([{ name: "a", source: "./plugins/a", description: "d" }]), plugins: { a: young("# a\n\n> **Durum:** Stabil.\n") } });
  assert.ok(untagged.errors.some((e) => /experimental \(ADR-0012\): start the description/.test(e)));
  assert.ok(untagged.errors.some((e) => /Status:\*\* Experimental/.test(e)));
  const tagged = run({ marketplace: mp([{ name: "a", source: "./plugins/a", description: "[experimental] d" }]), plugins: { a: young("# a\n\n> **Durum:** Deneysel, 0.3.0.\n") } });
  assert.deepEqual(tagged.errors, []);
  const stableTagged = run({ marketplace: mp([{ name: "a", source: "./plugins/a", description: "[experimental] d" }]), plugins: { a: okPlugin("a") } });
  assert.ok(stableTagged.errors.some((e) => /is stable \(ADR-0012\)/.test(e)));
});
