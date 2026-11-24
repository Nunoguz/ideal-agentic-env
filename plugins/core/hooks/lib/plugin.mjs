// Identity of the plugin that ships this copy of the shared hook library, read from
// <plugin>/.claude-plugin/plugin.json (this file lives in <plugin>/hooks/lib/).
// Shared file: the source of truth is shared/hooks-lib/ in the marketplace repo (npm run sync).
import { readFileSync } from "node:fs";

let cached = null;

export function pluginName() {
  if (cached) return cached;
  try {
    const manifest = JSON.parse(readFileSync(new URL("../../.claude-plugin/plugin.json", import.meta.url), "utf8"));
    cached = typeof manifest.name === "string" && manifest.name ? manifest.name : "plugin";
  } catch {
    cached = "plugin";
  }
  return cached;
}
