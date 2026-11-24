// data-sql's contract on a JVM project through the shared setup (shared/stack-lib.mjs is tested in scripts/).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadPlugin, PLUGIN_ROOT } from "./setup.mjs";
import { buildStackPlan } from "./stack-lib.mjs";

const { plugin, contract } = loadPlugin();

function project(files) {
  const root = mkdtempSync(join(tmpdir(), "iae-datasql-"));
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: root });
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  return root;
}

const dep = (g, a) => `<dependency><groupId>${g}</groupId><artifactId>${a}</artifactId></dependency>`;
const pom = (...deps) => `<project><dependencies>${deps.join("")}</dependencies></project>`;

test("Spring Boot + Flyway + PostgreSQL: sql, postgres and flyway profiles; Testcontainers means no CI service", () => {
  const files = { "src/main/resources/db/migration/V1__init.sql": "CREATE TABLE t (id int);\n" };
  const withTc = buildStackPlan(PLUGIN_ROOT, plugin, contract, project({ ...files, "pom.xml": pom(dep("org.springframework.boot", "spring-boot-starter-flyway"), dep("org.postgresql", "postgresql"), dep("org.testcontainers", "testcontainers-postgresql")) }));
  assert.deepEqual(withTc.profiles, ["sql", "postgres", "flyway"]);
  assert.ok(withTc.notes.some((n) => /start the database with Testcontainers/.test(n)));
  assert.ok(!withTc.notes.some((n) => /without Testcontainers/.test(n)));

  const withoutTc = buildStackPlan(PLUGIN_ROOT, plugin, contract, project({ ...files, "pom.xml": pom(dep("org.flywaydb", "flyway-core"), dep("com.microsoft.sqlserver", "mssql-jdbc")) }));
  assert.deepEqual(withoutTc.profiles, ["sql", "sqlserver", "flyway"]);
  assert.ok(withoutTc.notes.some((n) => /without Testcontainers/.test(n)));
});
