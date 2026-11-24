import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { globToRegExp, isOutside, matchesAny, relPosix } from "../lib/paths.mjs";

test("glob semantics", () => {
  const m = (g, p, o) => globToRegExp(g, o).test(p);
  assert.ok(m("**/*.ts", "a.ts"));
  assert.ok(m("**/*.ts", "src/deep/a.ts"));
  assert.ok(!m("src/*.ts", "src/deep/a.ts"));
  assert.ok(m(".claude/**", ".claude/rules/x.md"));
  assert.ok(m("**/migrations/**", "prisma/migrations/0001_init/migration.sql"));
  assert.ok(m("**/migrations/**", "src/Data/Migrations/2024_Init.cs", { nocase: true }));
  assert.ok(!m("**/migrations/**", "src/Data/Migrations/2024_Init.cs"));
  assert.ok(m("file?.md", "file1.md"));
  assert.ok(!m("a.md", "a_md"), "dots are literal");
  assert.ok(matchesAny("CLAUDE.md", ["x", "CLAUDE.md"]));
});

test("glob brace alternation", () => {
  const m = (g, p) => globToRegExp(g).test(p);
  assert.ok(m("**/*.{ts,tsx}", "src/a.tsx"));
  assert.ok(m("**/*.{ts,tsx}", "a.ts"));
  assert.ok(!m("**/*.{ts,tsx}", "a.js"));
  assert.ok(m("apps/{api,worker}/**", "apps/worker/src/x.ts"));
  assert.ok(!m("apps/{api,worker}/**", "apps/web/x.ts"));
  assert.ok(m("a{b", "a{b"), "an unclosed brace is literal");
  assert.ok(m("a,b", "a,b"), "a comma outside braces is literal");
});

test("relative paths are POSIX and outside paths are detected", () => {
  const root = join("/", "proj");
  assert.equal(relPosix(root, join(root, "src", "a.ts")), "src/a.ts");
  assert.equal(relPosix(root, "src/a.ts"), "src/a.ts");
  assert.ok(isOutside(relPosix(root, join("/", "etc", "hosts"))));
  assert.ok(!isOutside("src/a.ts"));
});
