#!/usr/bin/env node
// PreToolUse(Read|Grep) — fail closed. Secret files are never read into the context.
import { isManaged } from "./lib/managed.mjs";
import { loadConfig } from "./lib/config.mjs";
import { guard } from "./lib/io.mjs";
import { projectDir } from "./lib/paths.mjs";
import { isSecretFile } from "./lib/secret-rules.mjs";

await guard("read-guard", (input) => {
  if (!isManaged(projectDir(input))) return null; // dormant until /core:init (lib/managed.mjs)
  const root = projectDir(input);
  const target = input.tool_input?.file_path ?? input.tool_input?.path;
  if (!isSecretFile(target, loadConfig(root), root)) return null;
  return { decision: "deny", reason: `${target} is a secret file; ask the user for the specific non-secret value you need` };
});
