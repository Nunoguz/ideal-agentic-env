#!/usr/bin/env node
// Screenshots of a running React Native / Expo app on the booted iOS simulator or Android emulator, one per
// route × appearance (light, dark), for visual review (stack-mobile device-verify). Routes are opened as deep
// links: `--prefix myapp://` for a development build, or `--prefix exp://127.0.0.1:8081/--/` for Expo Go.
// Zero dependencies (Node >= 20). Nothing is installed; the simulator or emulator must already run the app.
//
//   node device-shots.mjs --platform ios|android --prefix <url-prefix> --routes /,/loans [--out artifacts/device]
//                         [--modes light,dark] [--wait 3] [--device <udid-or-serial>] [--dry-run]
import { spawnSync } from "node:child_process";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const slug = (route) => route.replace(/^\/+|\/+$/g, "").replace(/[^A-Za-z0-9._-]+/g, "-") || "home";
// `myapp://` + `/loans` → `myapp://loans`; `exp://host/--/` + `/loans` → `exp://host/--/loans`.
const join2 = (prefix, route) => {
  const path = route.replace(/^\/+/, "");
  return prefix.endsWith("://") ? `${prefix}${path}` : `${prefix.replace(/\/+$/, "")}/${path}`;
};

/** The command sequence for one platform: [{ cmd, args, out? }]. `out` means: write stdout to that file. */
export function plan({ platform, prefix, routes, modes = ["light", "dark"], out = "artifacts/device", device = null, wait = 3 }) {
  if (!["ios", "android"].includes(platform)) throw new Error("--platform must be ios or android");
  if (!prefix || !/^[a-z][a-z0-9+.-]*:\/\//i.test(prefix)) throw new Error("--prefix must be a URL prefix such as myapp:// or exp://127.0.0.1:8081/--/");
  if (!routes?.length) throw new Error("--routes needs at least one route");
  for (const m of modes) if (!["light", "dark"].includes(m)) throw new Error(`unknown mode ${m}`);
  const steps = [];
  const sleep = { cmd: "sleep", args: [String(wait)] };
  for (const mode of modes) {
    if (platform === "ios") steps.push({ cmd: "xcrun", args: ["simctl", "ui", device ?? "booted", "appearance", mode] });
    else steps.push({ cmd: "adb", args: [...(device ? ["-s", device] : []), "shell", "cmd", "uimode", "night", mode === "dark" ? "yes" : "no"] });
    for (const route of routes) {
      const url = join2(prefix, route);
      const file = join(out, `${slug(route)}-${platform}-${mode}.png`);
      if (platform === "ios") {
        steps.push({ cmd: "xcrun", args: ["simctl", "openurl", device ?? "booted", url] }, sleep);
        steps.push({ cmd: "xcrun", args: ["simctl", "io", device ?? "booted", "screenshot", file] });
      } else {
        const s = device ? ["-s", device] : [];
        steps.push({ cmd: "adb", args: [...s, "shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", url] }, sleep);
        steps.push({ cmd: "adb", args: [...s, "exec-out", "screencap", "-p"], out: file });
      }
    }
  }
  return steps;
}

function parse(argv) {
  const o = {};
  const spec = { "--platform": "s", "--prefix": "s", "--routes": "l", "--out": "s", "--modes": "l", "--wait": "s", "--device": "s", "--dry-run": "b" };
  for (let i = 0; i < argv.length; i++) {
    const kind = spec[argv[i]];
    if (!kind) throw new Error(`unknown argument ${argv[i]}`);
    const key = argv[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (kind === "b") o[key] = true;
    else {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${argv[i - 1]} needs a value`);
      o[key] = kind === "l" ? v.split(",").map((x) => x.trim()).filter(Boolean) : v;
    }
  }
  if (o.wait !== undefined && !/^\d+(\.\d+)?$/.test(o.wait)) throw new Error("--wait must be a number of seconds");
  return o;
}

const isMain = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const o = parse(process.argv.slice(2));
    const steps = plan(o);
    if (o.dryRun) {
      for (const s of steps) console.log(`${s.cmd} ${s.args.join(" ")}${s.out ? ` > ${s.out}` : ""}`);
      process.exit(0);
    }
    mkdirSync(o.out ?? "artifacts/device", { recursive: true });
    const shots = [];
    for (const s of steps) {
      const r = spawnSync(s.cmd, s.args, { encoding: s.out ? "buffer" : "utf8", maxBuffer: 64 * 1024 * 1024, windowsHide: true });
      if (r.error || r.status !== 0) throw new Error(`${s.cmd} ${s.args.join(" ")} failed: ${r.error?.message ?? String(r.stderr).trim()}`);
      if (s.out) writeFileSync(s.out, r.stdout);
      const file = s.out ?? (s.cmd === "xcrun" && s.args[1] === "io" ? s.args.at(-1) : null);
      if (file) shots.push(file);
    }
    console.log(`device-shots: ${shots.length} screenshot(s)\n${shots.map((f) => `  ${f}`).join("\n")}`);
  } catch (err) {
    console.error(`device-shots: ${err.message}`);
    process.exit(1);
  }
}
