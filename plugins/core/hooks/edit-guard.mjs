#!/usr/bin/env node
// PreToolUse(Edit|Write|MultiEdit|NotebookEdit) — fail closed.
// Protected paths, merged migrations, secrets in written content, and writes into secret files.
import { isManaged } from "./lib/managed.mjs";
import { loadConfig } from "./lib/config.mjs";
import { guard, strictest } from "./lib/io.mjs";
import { checkPath, editedPath } from "./lib/path-rules.mjs";
import { projectDir } from "./lib/paths.mjs";
import { isSecretFile, scanContent, writtenText } from "./lib/secret-rules.mjs";

await guard("edit-guard", (input) => {
  if (!isManaged(projectDir(input))) return null; // dormant until /core:init (lib/managed.mjs)
  const root = projectDir(input);
  const cfg = loadConfig(root);
  const file = editedPath(input.tool_input);
  const secretTarget = isSecretFile(file, cfg, root)
    ? { decision: "ask", reason: `${file} is a secret file; only write it if the user asked you to` }
    : null;
  return strictest([checkPath(root, file, cfg), secretTarget, ...scanContent(writtenText(input.tool_name, input.tool_input))]);
});
