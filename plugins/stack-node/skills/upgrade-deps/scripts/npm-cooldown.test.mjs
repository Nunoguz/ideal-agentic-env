import { test } from "node:test";
import assert from "node:assert/strict";
import { eligibleVersion, outdatedRows, report } from "./npm-cooldown.mjs";

const NOW = Date.parse("2026-11-23T00:00:00Z");
const TIMES = {
  created: "2020-01-01T00:00:00Z",
  modified: "2026-11-22T00:00:00Z",
  "1.0.0": "2025-01-01T00:00:00Z",
  "1.1.0": "2026-10-01T00:00:00Z",
  "1.2.0": "2026-11-20T00:00:00Z",
  "2.0.0-rc.1": "2026-09-01T00:00:00Z",
  "2.0.0": "2026-11-01T00:00:00Z",
};

test("the newest stable version past the cooldown is chosen; prereleases and fresh releases are not", () => {
  assert.equal(eligibleVersion(TIMES, "1.0.0", "2.0.0", NOW, 14), "2.0.0");
  assert.equal(eligibleVersion(TIMES, "1.0.0", "1.2.0", NOW, 14), "1.1.0");
  assert.equal(eligibleVersion(TIMES, "1.1.0", "1.2.0", NOW, 14), null);
  assert.equal(eligibleVersion(TIMES, "1.1.0", "1.2.0", NOW, 0), "1.2.0");
});

test("rows flatten workspace arrays and flag major upgrades", () => {
  const rows = outdatedRows({ a: { current: "1.0.0", wanted: "1.1.0", latest: "2.0.0", dependent: "api" }, b: [{ current: "1.1.0", latest: "1.2.0" }, { current: "1.0.0", latest: "1.2.0" }] });
  assert.equal(rows.length, 3);
  const out = report(rows, { days: 14, now: NOW, timesOf: () => TIMES });
  assert.deepEqual(out.map((r) => [r.name, r.eligible, r.major]), [["a", "2.0.0", true], ["b", null, false], ["b", "1.1.0", false]]);
});

test("names that are not npm package names are never looked up", () => {
  let called = 0;
  const out = report([{ name: "a; rm -rf /", current: "1.0.0", latest: "2.0.0" }], { days: 14, now: NOW, timesOf: () => (called++, TIMES) });
  assert.equal(called, 0);
  assert.equal(out[0].eligible, null);
});
