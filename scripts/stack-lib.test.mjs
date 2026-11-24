// Tests for the stack contract v2 parts of shared/stack-lib.mjs (ADR-0010): non-npm manifests, the new
// conditions, verify placeholders and CI blocks. Plugin-specific behaviour is tested next to each plugin.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { apply } from "../shared/scaffold-lib.mjs";
import { buildStackPlan, contextFor, dotnetProjects, ensureRegions, javaVersion, jvmProjects, listFiles, planCi } from "../shared/stack-lib.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const CORE_CI = readFileSync(join(REPO, "plugins/core/skills/init/templates/.github/workflows/ci.yml.tmpl"), "utf8").replace("{{STACK_SETUP}}\n", "      - run: npm ci\n");

function tree(files) {
  const root = mkdtempSync(join(tmpdir(), "iae-stacklib-"));
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: root });
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), typeof content === "string" ? content : JSON.stringify(content, null, 2));
  }
  return root;
}

const WEB_API = `<Project Sdk="Microsoft.NET.Sdk.Web">
  <ItemGroup>
    <PackageReference Include="Npgsql.EntityFrameworkCore.PostgreSQL" />
    <PackageReference Update="Serilog.AspNetCore" Version="9.0.0" />
  </ItemGroup>
</Project>`;
const TESTS = `<Project>
  <Sdk Name="Microsoft.NET.Sdk" />
  <ItemGroup><PackageReference Include="xunit.v3" Version="3.0.0" /></ItemGroup>
</Project>`;

test("dotnet projects: package references, Update entries and both Sdk forms are read", () => {
  const root = tree({ "src/Api/Api.csproj": WEB_API, "tests/Api.Tests/Api.Tests.csproj": TESTS, "src/Api/bin/Debug/Copy.csproj": WEB_API });
  const units = dotnetProjects(root, listFiles(root));
  assert.deepEqual(units.map((u) => [u.dir, u.sdk, [...u.deps]]), [
    ["src/Api", "Microsoft.NET.Sdk.Web", ["Npgsql.EntityFrameworkCore.PostgreSQL", "Serilog.AspNetCore"]],
    ["tests/Api.Tests", "Microsoft.NET.Sdk", ["xunit.v3"]],
  ]);
});

const PLUGIN = { name: "demo", version: "1.0.0" };

function pluginDir(contract, fragments = {}) {
  const dir = mkdtempSync(join(tmpdir(), "iae-plugin-"));
  mkdirSync(join(dir, "rules"));
  for (const r of Object.values(contract.profiles).flatMap((p) => p.rules ?? [])) writeFileSync(join(dir, "rules", r), `# ${r}\n`);
  for (const [rel, text] of Object.entries(fragments)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  return dir;
}

const CONFIG = { verify: { fast: [], full: [] }, format: [] };

test("dotnet profiles: per-project rule paths, sdk and file-content conditions, {solution} placeholder", () => {
  const contract = {
    ecosystem: "dotnet",
    profiles: {
      dotnet: { scope: "repo", detect: { files: ["**/*.csproj"] }, paths: ["**/*.cs"], rules: ["dotnet.md"] },
      aspnetcore: { ecosystem: "dotnet", detect: { sdk: ["Microsoft.NET.Sdk.Web"] }, paths: ["**/*.cs"], rules: ["aspnetcore.md"] },
      efcore: { detect: { dependencies: ["Npgsql.EntityFrameworkCore.PostgreSQL"] }, paths: ["**/Migrations/**"], rules: ["efcore.md"] },
    },
    format: [
      { glob: "**/*.cs", run: "dotnet csharpier format {file}", when: { fileContains: { ".config/dotnet-tools.json": "csharpier" } } },
      { glob: "**/*.cs", run: "dotnet format whitespace --folder --include {file}", when: { notFileContains: { ".config/dotnet-tools.json": "csharpier" } } },
    ],
    verify: { fast: [{ name: "dotnet build", run: "dotnet build {solution} --nologo", when: { files: ["**/*.csproj"] } }] },
    dependabot: { ecosystem: "nuget", lockfiles: ["packages.lock.json"] },
  };
  const dir = pluginDir(contract);
  const files = { "src/Api/Api.csproj": WEB_API, "tests/Api.Tests/Api.Tests.csproj": TESTS, ".claude/ideal-agentic-env.json": CONFIG };
  const withoutSln = buildStackPlan(dir, PLUGIN, contract, tree(files));
  assert.deepEqual(withoutSln.profiles, ["dotnet", "aspnetcore (src/Api)", "efcore (src/Api)"]);
  assert.match(withoutSln.actions.find((a) => a.rel.endsWith("aspnetcore.md")).content, /- "src\/Api\/\*\*\/\*\.cs"/);
  const cfg = JSON.parse(withoutSln.actions.find((a) => a.rel === ".claude/ideal-agentic-env.json").content);
  assert.deepEqual(cfg.verify.fast, [], "no solution: the step is left out");
  assert.deepEqual(cfg.format.map((f) => f.run), ["dotnet format whitespace --folder --include {file}"]);
  assert.ok(withoutSln.notes.some((n) => /no solution file/.test(n)));
  assert.ok(withoutSln.notes.some((n) => /no lockfile \(packages\.lock\.json\)/.test(n)));

  const withSln = buildStackPlan(dir, PLUGIN, contract, tree({ ...files, "App.slnx": "<Solution />", ".config/dotnet-tools.json": '{"tools":{"csharpier":{}}}', "src/Api/packages.lock.json": "{}" }));
  const cfg2 = JSON.parse(withSln.actions.find((a) => a.rel === ".claude/ideal-agentic-env.json").content);
  assert.deepEqual(cfg2.verify.fast, [{ name: "dotnet build", run: 'dotnet build "App.slnx" --nologo' }]);
  assert.deepEqual(cfg2.format.map((f) => f.run), ["dotnet csharpier format {file}"]);
  assert.ok(!withSln.notes.some((n) => /no solution file|no lockfile/.test(n)));
  assert.match(withSln.actions.find((a) => a.rel === ".github/dependabot.yml")?.note ?? "", /governance:setup/);
});

test("ensureRegions adds the three regions to a core-shaped ci.yml, but never a second services: key", () => {
  const legacy = CORE_CI.replace(/^\s*# [<>]{3} ideal-agentic-env:.*\n/gm, "");
  const r = ensureRegions(legacy);
  assert.deepEqual(r.added.sort(), ["after", "services", "steps"]);
  assert.equal(r.text, CORE_CI.replace(/\r\n/g, "\n"));
  const withServices = legacy.replace("    steps:\n", "    services:\n      redis:\n        image: redis\n    steps:\n");
  const s = ensureRegions(withServices);
  assert.deepEqual(s.missing, ["services"]);
  assert.deepEqual(s.added.sort(), ["after", "steps"]);
  assert.deepEqual(ensureRegions("name: other\n").missing, ["services", "steps", "after"]);
});

const CI_CONTRACT = {
  profiles: { web: { detect: { dependencies: ["next"] }, paths: ["**/*.ts"], rules: ["web.md"] } },
  ci: {
    services: [{ file: "ci/pg.yml", when: { dependencies: ["pg"] }, note: "set DATABASE_URL" }],
    steps: [
      { file: "ci/browsers.yml", when: { dependencies: ["@playwright/test"] } },
      { file: "ci/dotnet.yml", when: { dependencies: ["next"] } },
    ],
    after: [{ file: "ci/upload.yml", when: { dependencies: ["@playwright/test"] } }],
  },
};
const FRAGMENTS = {
  "ci/pg.yml": "# db\npostgres:\n  image: postgres@sha256:" + "a".repeat(64) + "\n  ports:\n    - 5432:5432\n",
  "ci/browsers.yml": "- run: npx playwright install chromium\n  working-directory: {{DIR}}\n",
  "ci/dotnet.yml": "- uses: actions/setup-dotnet@" + "b".repeat(40) + " # v4\n",
  "ci/upload.yml": "- uses: actions/upload-artifact@" + "c".repeat(40) + " # v7\n  with:\n    path: {{DIR}}/artifacts/ui/\n",
};

test("planCi writes each block into its region with the right indentation and is idempotent", () => {
  const dir = pluginDir(CI_CONTRACT, FRAGMENTS);
  const root = tree({
    "package.json": { name: "m", workspaces: ["apps/*"] },
    "apps/web/package.json": { name: "web", dependencies: { next: "16", pg: "8" }, devDependencies: { "@playwright/test": "1" } },
    ".github/workflows/ci.yml": CORE_CI.replace("      - run: npm ci\n", "      - run: npm ci\n      - uses: actions/setup-dotnet@" + "b".repeat(40) + " # v4\n"),
  });
  const first = planCi(dir, PLUGIN, CI_CONTRACT, contextFor(root));
  assert.equal(first.action.action, "merge");
  const ci = first.action.content;
  assert.match(ci, /    # >>> ideal-agentic-env:services .*\n    services:\n      # --- demo 1\.0\.0\n      # db\n      postgres:\n        image: postgres@sha256:a{64}\n/);
  assert.match(ci, /      # --- demo 1\.0\.0\n      - run: npx playwright install chromium\n        working-directory: apps\/web\n      # <<< ideal-agentic-env:steps\n      - run: node scripts\/verify\.mjs --full\n/);
  assert.match(ci, /path: apps\/web\/artifacts\/ui\/\n      # <<< ideal-agentic-env:after/);
  assert.ok(first.notes.some((n) => /already uses actions\/setup-dotnet/.test(n)), "an action the project set up itself is not added again");
  assert.ok(first.notes.some((n) => /set DATABASE_URL/.test(n)));
  apply(root, [first.action]);
  assert.equal(planCi(dir, PLUGIN, CI_CONTRACT, contextFor(root)).action.action, "skip");
  const runAgain = tree({
    "apps/web/package.json": { name: "web", devDependencies: { "@playwright/test": "1" } },
    ".github/workflows/ci.yml": CORE_CI.replace("      - run: npm ci\n", "      - run: npm ci\n      - run:   npx playwright install chromium\n        working-directory: apps/web\n"),
  });
  const dupe = planCi(dir, PLUGIN, CI_CONTRACT, contextFor(runAgain));
  assert.ok(dupe.notes.some((n) => /already runs npx playwright install chromium/.test(n)), "a step the project already runs is not added again");

  // Another plugin's block is kept, and ours is refreshed only with --refresh.
  const other = { name: "aaa", version: "2.0.0" };
  const otherDir = pluginDir({ profiles: CI_CONTRACT.profiles, ci: { steps: [{ file: "ci/x.yml" }] } }, { "ci/x.yml": "- run: echo other\n" });
  const withOther = planCi(otherDir, other, { profiles: CI_CONTRACT.profiles, ci: { steps: [{ file: "ci/x.yml" }] } }, contextFor(root));
  apply(root, [withOther.action]);
  const text = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
  const steps = text.slice(text.indexOf("# >>> ideal-agentic-env:steps"));
  assert.ok(steps.indexOf("# --- aaa 2.0.0") < steps.indexOf("# --- demo 1.0.0"), "blocks are sorted by plugin");
  writeFileSync(join(dir, "ci/browsers.yml"), "- run: npx playwright install --with-deps chromium\n  working-directory: {{DIR}}\n");
  assert.match(planCi(dir, PLUGIN, CI_CONTRACT, contextFor(root)).action.note, /--refresh/);
  const refreshed = planCi(dir, { ...PLUGIN, version: "1.1.0" }, CI_CONTRACT, contextFor(root), { refresh: true });
  assert.match(refreshed.action.content, /# --- demo 1\.1\.0\n      - run: npx playwright install --with-deps chromium/);
  assert.match(refreshed.action.content, /# --- aaa 2\.0\.0\n      - run: echo other/);
});

test("planCi: no ci.yml, a service the workflow already has, and no matching fragment", () => {
  const dir = pluginDir(CI_CONTRACT, FRAGMENTS);
  const base = { "apps/web/package.json": { name: "web", dependencies: { next: "16", pg: "8" } } };
  assert.match(planCi(dir, PLUGIN, CI_CONTRACT, contextFor(tree(base))).action.note, /core:init/);
  const legacy = CORE_CI.replace(/^\s*# [<>]{3} ideal-agentic-env:services.*\n/gm, "").replace("    steps:\n", "    services:\n      postgres:\n        image: postgres:17\n    steps:\n");
  const r = planCi(dir, PLUGIN, CI_CONTRACT, contextFor(tree({ ...base, ".github/workflows/ci.yml": legacy })));
  assert.ok(r.notes.some((n) => /no ideal-agentic-env:services region; add the block from demo\/ci\/pg\.yml/.test(n)));
  assert.ok(r.notes.some((n) => /already declares services/.test(n)));
  const unrelated = tree({ "apps/x/package.json": { name: "x", dependencies: { express: "5" } }, ".github/workflows/ci.yml": CORE_CI });
  assert.equal(planCi(dir, PLUGIN, CI_CONTRACT, contextFor(unrelated)).action, null);
});

const POM_ROOT = `<project>
  <parent><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-parent</artifactId><version>4.1.1</version></parent>
  <properties><java.version>25</java.version></properties>
  <modules><module>app</module></modules>
  <!-- <dependency><groupId>x</groupId><artifactId>commented-out</artifactId></dependency> -->
</project>`;
const POM_APP = `<project>
  <parent><groupId>com.example</groupId><artifactId>root</artifactId></parent>
  <dependencies>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-webmvc</artifactId>
      <exclusions><exclusion><groupId>a</groupId><artifactId>b</artifactId></exclusion></exclusions></dependency>
    <dependency><groupId>org.flywaydb</groupId><artifactId>flyway-core</artifactId></dependency>
  </dependencies>
  <build><plugins><plugin><groupId>com.diffplug.spotless</groupId><artifactId>spotless-maven-plugin</artifactId></plugin>
    <plugin><artifactId>maven-surefire-plugin</artifactId></plugin></plugins></build>
</project>`;

test("jvm projects: Maven dependencies, parents and plugins; Gradle coordinates and the version catalog", () => {
  const maven = tree({ "pom.xml": POM_ROOT, "app/pom.xml": POM_APP, "app/target/classes/pom.xml": POM_APP });
  const units = jvmProjects(maven, listFiles(maven));
  assert.deepEqual(units.map((u) => [u.file, u.build, u.workspaceRoot]), [["app/pom.xml", "maven", false], ["pom.xml", "maven", true]]);
  assert.deepEqual([...units[0].deps], ["com.example:root", "org.springframework.boot:spring-boot-starter-webmvc", "org.flywaydb:flyway-core", "com.diffplug.spotless:spotless-maven-plugin", "org.apache.maven.plugins:maven-surefire-plugin"]);
  assert.deepEqual([...units[1].deps], ["org.springframework.boot:spring-boot-starter-parent"]);
  assert.equal(javaVersion(maven), "25");

  const gradle = tree({
    "settings.gradle.kts": 'rootProject.name = "demo"',
    "build.gradle.kts": 'plugins { id("org.springframework.boot") version "4.1.1" }\njava { toolchain { languageVersion = JavaLanguageVersion.of(21) } }\ndependencies {\n  implementation("org.springframework.boot:spring-boot-starter-webmvc")\n  testImplementation(libs.archunit)\n}',
    "gradle/libs.versions.toml": '[libraries]\narchunit = { module = "com.tngtech.archunit:archunit-junit5", version = "1.4.1" }\npg = { group = "org.postgresql", name = "postgresql", version.ref = "pg" }',
  });
  const [g] = jvmProjects(gradle, listFiles(gradle));
  assert.equal(g.workspaceRoot, false);
  assert.deepEqual([...g.deps].sort(), ["com.tngtech.archunit:archunit-junit5", "org.postgresql:postgresql", "org.springframework.boot:spring-boot-starter-webmvc"]);
  assert.equal(javaVersion(gradle), "21");
});

test("jvm contract: dependency prefixes, platform verify commands, Dependabot list and {{JAVA_VERSION}}", () => {
  const contract = {
    ecosystem: "jvm",
    profiles: {
      java: { scope: "repo", detect: { files: ["**/pom.xml"] }, paths: ["**/*.java"], rules: ["java.md"] },
      spring: { detect: { dependencyPrefixes: ["org.springframework.boot:spring-boot-starter"] }, paths: ["src/main/**/*.java"], rules: ["spring.md"] },
    },
    verify: { fast: [{ name: "maven compile", run: { posix: "./mvnw -q compile", win32: "mvnw.cmd -q compile" }, when: { files: ["mvnw"] } }] },
    dependabot: [
      { ecosystem: "maven", lockfiles: [], when: { files: ["**/pom.xml"] } },
      { ecosystem: "gradle", lockfiles: [], when: { files: ["**/build.gradle", "**/build.gradle.kts"] } },
    ],
    ci: { steps: [{ file: "ci/java.yml", when: { files: ["**/pom.xml"] } }] },
  };
  const dir = pluginDir(contract, { "ci/java.yml": '- uses: actions/setup-java@' + "d".repeat(40) + ' # v5\n  with:\n    java-version: "{{JAVA_VERSION}}"\n' });
  const root = tree({
    "pom.xml": POM_ROOT, "app/pom.xml": POM_APP, mvnw: "#!/bin/sh\n",
    ".claude/ideal-agentic-env.json": CONFIG, ".github/workflows/ci.yml": CORE_CI,
    ".github/dependabot.yml": "version: 2\nupdates:\n",
  });
  const plan = buildStackPlan(dir, PLUGIN, contract, root);
  assert.deepEqual(plan.profiles, ["java", "spring (app)"], "the aggregator pom alone does not count as a Spring module");
  const cfg = JSON.parse(plan.actions.find((a) => a.rel === ".claude/ideal-agentic-env.json").content);
  assert.deepEqual(cfg.verify.fast, [{ name: "maven compile", run: { posix: "./mvnw -q compile", win32: "mvnw.cmd -q compile" } }]);
  const dependabot = plan.actions.find((a) => a.rel === ".github/dependabot.yml");
  assert.match(dependabot.content, /package-ecosystem: maven\n    directory: "\/"\n/);
  assert.match(plan.actions.find((a) => a.rel === ".github/workflows/ci.yml").content, /java-version: "25"/);
  assert.ok(!plan.notes.some((n) => /no lockfile/.test(n)), "Maven has no lockfile to ask for");
});
