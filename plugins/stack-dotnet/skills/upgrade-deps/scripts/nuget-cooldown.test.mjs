import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compare, declaredPackages, eligible, publishedVersions, report } from "./nuget-cooldown.mjs";

const NOW = Date.parse("2026-11-23T00:00:00Z");
const v = (version, date, listed = true) => ({ version, published: `${date}T00:00:00Z`, listed });

test("versions compare numerically, with four-part versions", () => {
  assert.ok(compare("10.0.10", "10.0.9") > 0);
  assert.ok(compare("9.0.0", "10.0.0") < 0);
  assert.equal(compare("1.2", "1.2.0.0"), 0);
});

test("eligible picks the newest stable version past the cooldown, within the major and overall", () => {
  const versions = [v("8.0.11", "2026-01-10"), v("9.0.4", "2026-10-01"), v("9.0.5", "2026-11-20"), v("10.0.0-rc.2", "2026-09-01"), v("9.0.6", "2026-10-02", false)];
  assert.deepEqual(eligible(versions, "8.0.10", { now: NOW }), { latest: "9.0.5", sameMajor: "8.0.11", any: "9.0.4" });
  assert.deepEqual(eligible(versions, "9.0.5", { now: NOW, days: 0 }), { latest: "9.0.5", sameMajor: "9.0.5", any: "9.0.5" });
});

test("declared packages come from Directory.Packages.props and project files, skipping bin/obj and MSBuild properties", () => {
  const root = mkdtempSync(join(tmpdir(), "iae-nuget-"));
  writeFileSync(join(root, "Directory.Packages.props"), '<Project><ItemGroup><PackageVersion Include="Npgsql" Version="10.0.0" /><PackageVersion Include="Serilog" Version="$(SerilogVersion)" /></ItemGroup></Project>');
  mkdirSync(join(root, "src", "Api", "obj"), { recursive: true });
  writeFileSync(join(root, "src", "Api", "Api.csproj"), '<Project><ItemGroup><PackageReference Include="Polly" Version="8.5.0" /><PackageReference Include="Npgsql" VersionOverride="9.0.3" /></ItemGroup></Project>');
  writeFileSync(join(root, "src", "Api", "obj", "Copy.csproj"), '<Project><ItemGroup><PackageReference Include="Ghost" Version="1.0.0" /></ItemGroup></Project>');
  const found = declaredPackages(root);
  assert.deepEqual([...found.keys()].sort(), ["Npgsql", "Polly"]);
  assert.deepEqual([...found.get("Npgsql").versions].sort(), ["10.0.0", "9.0.3"]);
});

test("registration pages are fetched when not inlined; a missing package is empty, other errors are reported per row", async () => {
  const pages = {
    "https://api.nuget.org/v3/registration5-gz-semver2/polly/index.json": { items: [{ "@id": "page1" }, { items: [{ catalogEntry: { version: "8.6.0", published: "2026-09-01T00:00:00Z" } }] }] },
    page1: { items: [{ catalogEntry: { version: "8.5.0", published: "2026-01-01T00:00:00Z" } }, { catalogEntry: { version: "8.5.1", published: "1900-01-01T00:00:00Z", listed: false } }] },
  };
  const fetchImpl = async (url) => (url in pages ? { ok: true, status: 200, json: async () => pages[url] } : { ok: false, status: url.includes("npgsql") ? 503 : 404 });
  const versions = await publishedVersions("Polly", fetchImpl);
  assert.deepEqual(versions.map((x) => [x.version, x.listed]), [["8.5.0", true], ["8.5.1", false], ["8.6.0", true]]);
  assert.deepEqual(await publishedVersions("Nope", fetchImpl), []);
  const root = mkdtempSync(join(tmpdir(), "iae-nuget-report-"));
  writeFileSync(join(root, "A.csproj"), '<Project><ItemGroup><PackageReference Include="Polly" Version="8.5.0" /><PackageReference Include="Npgsql" Version="9.0.0" /></ItemGroup></Project>');
  const rows = await report(root, { now: NOW, fetchImpl });
  assert.deepEqual(rows.find((r) => r.id === "Polly"), { id: "Polly", current: "8.5.0", latest: "8.6.0", sameMajor: "8.6.0", any: "8.6.0", files: ["A.csproj"], mixed: undefined });
  assert.match(rows.find((r) => r.id === "Npgsql").error, /503/);
});
