import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compare, declaredArtifacts, eligible, report, stable } from "./maven-cooldown.mjs";

const NOW = Date.parse("2026-11-24T00:00:00Z");

test("versions compare numerically; milestones and release candidates are not stable", () => {
  assert.ok(compare("4.1.10", "4.1.9") > 0);
  assert.ok(compare("3.5.0", "4.0.0") < 0);
  assert.ok(stable("4.1.2") && stable("33.4.0-jre") && stable("1.5.1"));
  assert.ok(!stable("4.2.0-M1") && !stable("2.0.0-RC1") && !stable("1.0.0-SNAPSHOT") && !stable("7.0.0.Beta2"));
});

test("declared artifacts: literal versions and properties in poms, the version catalog; BOM-managed and target/ skipped", () => {
  const root = mkdtempSync(join(tmpdir(), "iae-maven-"));
  writeFileSync(join(root, "pom.xml"), `<project>
  <parent><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-parent</artifactId><version>4.1.1</version></parent>
  <properties><archunit.version>1.5.0</archunit.version></properties>
  <dependencies>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-webmvc</artifactId></dependency>
    <dependency><groupId>com.tngtech.archunit</groupId><artifactId>archunit-junit5</artifactId><version>\${archunit.version}</version></dependency>
    <dependency><groupId>x</groupId><artifactId>y</artifactId><version>\${project.version}</version></dependency>
  </dependencies>
  <build><plugins><plugin><artifactId>maven-surefire-plugin</artifactId><version>3.5.4</version></plugin></plugins></build>
</project>`);
  mkdirSync(join(root, "target"), { recursive: true });
  writeFileSync(join(root, "target", "pom.xml"), "<project><parent><groupId>g</groupId><artifactId>ghost</artifactId><version>1.0</version></parent></project>");
  mkdirSync(join(root, "gradle"));
  writeFileSync(join(root, "gradle", "libs.versions.toml"), '[versions]\npg = "42.7.8"\n\n[libraries]\npg = { group = "org.postgresql", name = "postgresql", version.ref = "pg" }\nguava = { module = "com.google.guava:guava", version = "33.4.0-jre" }\n');
  const found = declaredArtifacts(root);
  assert.deepEqual([...found.keys()].sort(), ["com.google.guava:guava", "com.tngtech.archunit:archunit-junit5", "org.apache.maven.plugins:maven-surefire-plugin", "org.postgresql:postgresql", "org.springframework.boot:spring-boot-starter-parent"]);
  assert.deepEqual([...found.get("com.tngtech.archunit:archunit-junit5").versions], ["1.5.0"]);
});

function central(dates) {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push(`${opts.method ?? "GET"} ${url}`);
    if (url.endsWith("maven-metadata.xml")) {
      if (url.includes("/missing/")) return { ok: false, status: 404 };
      if (url.includes("/broken/")) return { ok: false, status: 503 };
      return { ok: true, status: 200, text: async () => `<metadata><versioning><versions>${Object.keys(dates).map((v) => `<version>${v}</version>`).join("")}</versions></versioning></metadata>` };
    }
    const v = Object.keys(dates).find((x) => url.endsWith(`-${x}.pom`));
    return { ok: Boolean(v), status: v ? 200 : 404, headers: { get: () => (v ? new Date(dates[v]).toUTCString() : null) } };
  };
  return { fetchImpl, calls };
}

test("eligible: the newest stable version past the cooldown, within the major and overall, newest first", async () => {
  const { fetchImpl, calls } = central({ "3.5.7": "2026-10-01", "4.1.1": "2026-08-20", "4.1.2": "2026-10-22", "4.1.3": "2026-11-19", "4.2.0": "2026-11-19", "4.3.0-M1": "2026-09-01", "5.0.0": "2026-11-20" });
  assert.deepEqual(await eligible("org.springframework.boot:spring-boot-starter-parent", "4.1.1", { now: NOW, fetchImpl }), { latest: "5.0.0", sameMajor: "4.1.2", any: "4.1.2" });
  assert.ok(!calls.some((c) => c.includes("3.5.7")), "older versions are never fetched");
  assert.deepEqual(await eligible("a:b", "3.5.7", { now: NOW, fetchImpl }), { latest: "5.0.0", sameMajor: "3.5.7", any: "4.1.2" });
});

test("report: a missing artifact has no candidates; other errors are reported per row", async () => {
  const root = mkdtempSync(join(tmpdir(), "iae-maven-"));
  writeFileSync(join(root, "pom.xml"), "<project><dependencies><dependency><groupId>missing</groupId><artifactId>a</artifactId><version>1.0.0</version></dependency><dependency><groupId>broken</groupId><artifactId>b</artifactId><version>1.0.0</version></dependency></dependencies></project>");
  const { fetchImpl } = central({});
  const rows = await report(root, { now: NOW, fetchImpl });
  assert.deepEqual(rows.map((r) => [r.id, r.latest ?? null, r.error ?? null]), [["broken:b", null, "maven-metadata.xml returned 503"], ["missing:a", null, null]]);
});
