// Is this a project set up with /core:init? core may be installed for the whole user (one install for every
// project), so its hooks stay dormant until a project opts in: they act only below a directory that holds
// .claude/ideal-agentic-env.json. The file is a protected path, so a session cannot quietly opt a project out.
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { CONFIG_PATH } from "./config.mjs";

/** The managed project's root at or above `dir`, or null when no ancestor has the config file. */
export function managedRoot(dir) {
  let d = resolve(dir);
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(d, CONFIG_PATH))) return d;
    const up = dirname(d);
    if (up === d) return null;
    d = up;
  }
  return null;
}

export const isManaged = (dir) => managedRoot(dir) !== null;
