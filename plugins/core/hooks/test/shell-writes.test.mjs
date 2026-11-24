import { test } from "node:test";
import assert from "node:assert/strict";
import { shellWriteTargets } from "../lib/shell-writes.mjs";

const cases = [
  ["cat <<'EOF' > .github/workflows/ci.yml", [".github/workflows/ci.yml"]],
  ["echo x >> CLAUDE.md", ["CLAUDE.md"]],
  ["echo x>.claude/settings.json", [".claude/settings.json"]],
  ["npm test 2>&1 | tee build.log", ["build.log"]],
  ["printf '{}' | tee -a .claude/settings.json > /dev/null", [".claude/settings.json"]],
  ["sed -i '' 's/a/b/' .github/workflows/ci.yml", [".github/workflows/ci.yml"]],
  ["sed -i -e 's/a/b/' scripts/verify.mjs src/a.ts", ["scripts/verify.mjs", "src/a.ts"]],
  ["sed 's/a/b/' CLAUDE.md", []],
  ["perl -pi -e 's/a/b/' CLAUDE.md", ["CLAUDE.md"]],
  ["cp /tmp/ci.yml .github/workflows/", [".github/workflows/"]],
  ["mv -f a.txt b.txt", ["b.txt"]],
  ["cp -t .githooks pre-push", [".githooks"]],
  ["rm -rf .github", [".github"]],
  ["touch .claude/x && truncate -s 0 scripts/verify.mjs", [".claude/x", "scripts/verify.mjs"]],
  ["dd if=/dev/zero of=CLAUDE.md bs=1 count=0", ["CLAUDE.md"]],
  ["Set-Content -Path .github\\CODEOWNERS -Value x", [".github\\CODEOWNERS"]],
  ["Remove-Item .claude -Recurse", [".claude"]],
  ["copy a.txt .github\\x.yml", [".github\\x.yml"]],
  ["git status && npm test", []],
  ["node -e \"[1].map(x => x)\"", []],
  ["ls > /dev/null 2>&1", []],
];

for (const [command, want] of cases) {
  test(`shellWriteTargets: ${command}`, () => {
    const got = shellWriteTargets(command);
    for (const t of want) assert.ok(got.includes(t), `expected ${t} in ${JSON.stringify(got)}`);
    if (!want.length) assert.deepEqual(got.filter((t) => /^(\.github|\.claude|CLAUDE|scripts)/.test(t)), []);
  });
}
