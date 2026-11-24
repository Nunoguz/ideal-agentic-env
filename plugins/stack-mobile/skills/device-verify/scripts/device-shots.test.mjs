import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { plan, slug } from "./device-shots.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "device-shots.mjs");
const line = (s) => `${s.cmd} ${s.args.join(" ")}${s.out ? ` > ${s.out}` : ""}`;

test("routes become file-safe slugs", () => {
  assert.equal(slug("/"), "home");
  assert.equal(slug("/loans/42?tab=history"), "loans-42-tab-history");
});

test("iOS: appearance per mode, a deep link per route, then a simulator screenshot", () => {
  const steps = plan({ platform: "ios", prefix: "exp://127.0.0.1:8081/--/", routes: ["/", "/loans"], modes: ["dark"], out: "shots", wait: 2 });
  assert.deepEqual(steps.map(line), [
    "xcrun simctl ui booted appearance dark",
    "xcrun simctl openurl booted exp://127.0.0.1:8081/--/",
    "sleep 2",
    `xcrun simctl io booted screenshot ${join("shots", "home-ios-dark.png")}`,
    "xcrun simctl openurl booted exp://127.0.0.1:8081/--/loans",
    "sleep 2",
    `xcrun simctl io booted screenshot ${join("shots", "loans-ios-dark.png")}`,
  ]);
});

test("Android: night mode, an am start intent and screencap to a file, on the chosen device", () => {
  const steps = plan({ platform: "android", prefix: "myapp://", routes: ["/loans"], modes: ["light"], out: "o", device: "emulator-5554" });
  assert.deepEqual(steps.map(line), [
    "adb -s emulator-5554 shell cmd uimode night no",
    "adb -s emulator-5554 shell am start -W -a android.intent.action.VIEW -d myapp://loans",
    "sleep 3",
    `adb -s emulator-5554 exec-out screencap -p > ${join("o", "loans-android-light.png")}`,
  ]);
});

test("bad input is rejected; the CLI dry run prints the plan without touching a device", () => {
  assert.throws(() => plan({ platform: "web", prefix: "x://", routes: ["/"] }), /ios or android/);
  assert.throws(() => plan({ platform: "ios", prefix: "loans", routes: ["/"] }), /URL prefix/);
  assert.throws(() => plan({ platform: "ios", prefix: "x://", routes: [] }), /at least one route/);
  assert.throws(() => plan({ platform: "ios", prefix: "x://", routes: ["/"], modes: ["sepia"] }), /unknown mode/);
  const r = spawnSync(process.execPath, [SCRIPT, "--platform", "ios", "--prefix", "myapp://", "--routes", "/", "--dry-run"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /appearance light[\s\S]*appearance dark/);
  assert.equal(spawnSync(process.execPath, [SCRIPT, "--wait", "soon"], { encoding: "utf8" }).status, 1);
});
