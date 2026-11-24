// stack-java-spring's contract through the shared setup (shared/stack-lib.mjs is tested in scripts/).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { apply } from "./scaffold-lib.mjs";
import { loadPlugin, PLUGIN_ROOT } from "./setup.mjs";
import { buildStackPlan } from "./stack-lib.mjs";

const { plugin, contract } = loadPlugin();
const CORE_CI = readFileSync(join(PLUGIN_ROOT, "..", "core", "skills", "init", "templates", ".github", "workflows", "ci.yml.tmpl"), "utf8").replace("{{STACK_SETUP}}\n", "");

function project(files) {
  const root = mkdtempSync(join(tmpdir(), "iae-java-"));
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: root });
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), typeof content === "string" ? content : JSON.stringify(content, null, 2));
  }
  return root;
}

const POM = `<project>
  <parent><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-parent</artifactId><version>4.1.2</version></parent>
  <properties><java.version>25</java.version></properties>
  <dependencies>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-webmvc</artifactId></dependency>
    <dependency><groupId>org.springframework.modulith</groupId><artifactId>spring-modulith-starter-core</artifactId></dependency>
  </dependencies>
</project>`;
const BASE = {
  "pom.xml": POM,
  mvnw: "#!/bin/sh\n",
  "mvnw.cmd": "@echo off\n",
  "src/main/java/com/example/Application.java": "class Application {}",
  "src/test/java/com/example/ModularityTests.java": "class ModularityTests {}",
  ".claude/ideal-agentic-env.json": { verify: { fast: [], full: [] }, format: [] },
  ".github/dependabot.yml": "version: 2\nupdates:\n  - package-ecosystem: github-actions\n    directory: /\n",
  ".github/workflows/ci.yml": CORE_CI,
};

test("profiles: java, spring-boot and modulith for the Spring module, test for the test sources", () => {
  const plan = buildStackPlan(PLUGIN_ROOT, plugin, contract, project(BASE));
  assert.deepEqual(plan.profiles, ["java", "spring-boot", "modulith", "test"]);
  assert.match(plan.actions.find((a) => a.rel.endsWith("spring-boot.md")).content, /- "src\/main\/\*\*\/\*\.java"/);
  assert.match(plan.actions.find((a) => a.rel.endsWith("testing.md")).content, /- "\*\*\/src\/test\/\*\*\/\*\.java"/);
});

test("config: Maven wrapper verify steps per platform; Spotless only when the pom has it; Dependabot maven", () => {
  const plan = buildStackPlan(PLUGIN_ROOT, plugin, contract, project(BASE));
  const cfg = JSON.parse(plan.actions.find((a) => a.rel === ".claude/ideal-agentic-env.json").content);
  assert.deepEqual(cfg.verify.fast, [{ name: "maven compile", run: { posix: "./mvnw -B -ntp -q test-compile", win32: "mvnw.cmd -B -ntp -q test-compile" } }]);
  assert.deepEqual(cfg.verify.full.map((s) => s.name), ["maven verify"]);
  assert.deepEqual(cfg.format, []);
  assert.ok(plan.notes.some((n) => /no formatter: add the Spotless Maven plugin/.test(n)));
  assert.match(plan.actions.find((a) => a.rel === ".github/dependabot.yml").content, /package-ecosystem: maven\n    directory: "\/"/);

  const spotless = buildStackPlan(PLUGIN_ROOT, plugin, contract, project({ ...BASE, "pom.xml": POM.replace("</project>", "<build><plugins><plugin><groupId>com.diffplug.spotless</groupId><artifactId>spotless-maven-plugin</artifactId></plugin></plugins></build></project>") }));
  const cfg2 = JSON.parse(spotless.actions.find((a) => a.rel === ".claude/ideal-agentic-env.json").content);
  assert.deepEqual(cfg2.verify.fast.map((s) => s.name), ["maven compile", "spotless"]);
  assert.ok(!spotless.notes.some((n) => /no formatter/.test(n)));
});

test("no wrapper: mvn from PATH with a note; Gradle without a wrapper gets no step; core:init's steps are not duplicated", () => {
  const { mvnw, "mvnw.cmd": _, ...noWrapper } = BASE;
  const plan = buildStackPlan(PLUGIN_ROOT, plugin, contract, project(noWrapper));
  const cfg = JSON.parse(plan.actions.find((a) => a.rel === ".claude/ideal-agentic-env.json").content);
  assert.deepEqual(cfg.verify.fast, [{ name: "maven compile", run: "mvn -B -ntp -q test-compile" }]);
  assert.ok(plan.notes.some((n) => /no Maven wrapper/.test(n)));

  const gradle = buildStackPlan(PLUGIN_ROOT, plugin, contract, project({ ...Object.fromEntries(Object.entries(noWrapper).filter(([k]) => k !== "pom.xml")), "build.gradle.kts": 'dependencies { implementation("org.springframework.boot:spring-boot-starter-webmvc") }' }));
  assert.ok(gradle.notes.some((n) => /no Gradle wrapper/.test(n)));
  assert.match(gradle.actions.find((a) => a.rel === ".github/dependabot.yml").content, /package-ecosystem: gradle/);

  const init = { verify: { fast: [{ name: "maven compile", run: { posix: "./mvnw -B -ntp -q test-compile", win32: "mvnw.cmd -B -ntp -q test-compile" } }], full: [{ name: "maven verify", run: { posix: "./mvnw -B -ntp verify", win32: "mvnw.cmd -B -ntp verify" } }] }, format: [] };
  const again = buildStackPlan(PLUGIN_ROOT, plugin, contract, project({ ...BASE, ".claude/ideal-agentic-env.json": init }));
  assert.equal(again.actions.find((a) => a.rel === ".claude/ideal-agentic-env.json").action, "skip");
});

test("ci: setup-java at the pom's Java release with the Maven cache; idempotent", () => {
  const root = project(BASE);
  const plan = buildStackPlan(PLUGIN_ROOT, plugin, contract, root);
  const ci = plan.actions.find((a) => a.rel === ".github/workflows/ci.yml");
  assert.match(ci.content, /# --- stack-java-spring \d+\.\d+\.\d+\n\s+# Java for verify --full[\s\S]*actions\/setup-java@[0-9a-f]{40} # v\S+\n\s+with:\n\s+distribution: temurin\n\s+java-version: "25"\n\s+cache: maven/);
  apply(root, plan.actions);
  const second = buildStackPlan(PLUGIN_ROOT, plugin, contract, root);
  assert.deepEqual(second.actions.filter((a) => a.action !== "skip").map((a) => a.rel), []);
});
