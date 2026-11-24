#!/usr/bin/env node
// PostToolUse(Edit|Write|MultiEdit) — fail open (a reminder, never a blocker).
// When Claude writes personal-data-looking fields into a schema file (migration, model, entity, schema),
// it is reminded once per file and field set to update the data inventory or say why no update is needed.
// The same heuristic runs as a Law-layer gate in CI (.github/scripts/compliance-gate.mjs).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { soft } from "./lib/io.mjs";
import { isOutside, projectDir, relPosix } from "./lib/paths.mjs";
import { describe, findPersonalData, governanceConfig, isSchemaPath } from "./lib/pii-rules.mjs";
import { loadState, saveState, session } from "./lib/state.mjs";

const CONFIG_PATH = ".claude/ideal-agentic-env.json";
const MAX_REMEMBERED = 100;

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function writtenText(toolName, ti = {}) {
  if (toolName === "Write") return ti.content ?? "";
  if (toolName === "MultiEdit") return (ti.edits ?? []).map((e) => e?.new_string ?? "").join("\n");
  return ti.new_string ?? "";
}

await soft("inventory-check", (input) => {
  const file = input.tool_input?.file_path;
  if (typeof file !== "string") return null;
  const root = projectDir(input);
  const rel = relPosix(root, file);
  if (isOutside(rel)) return null;

  const cfg = governanceConfig(readJson(join(root, CONFIG_PATH)));
  const state = loadState(root);
  const s = session(state, input.session_id);

  if (rel === cfg.inventoryPath) {
    s.inventoryEdited = true;
    saveState(root, state);
    return null;
  }
  if (!isSchemaPath(rel, cfg.schemaPaths)) return null;

  const found = findPersonalData(writtenText(input.tool_name, input.tool_input), cfg.piiTerms);
  if (!found.length) return null;

  const key = `${rel}|${found.map((f) => f.label).sort().join(",")}`;
  s.reminded = Array.isArray(s.reminded) ? s.reminded : [];
  if (s.reminded.includes(key)) return null;
  s.reminded = [...s.reminded, key].slice(-MAX_REMEMBERED);
  saveState(root, state);

  const special = found.filter((f) => f.special).map((f) => f.label);
  const lines = [
    `[governance:inventory-check] ${rel} now contains fields that look like personal data: ${describe(found)}.`,
    s.inventoryEdited
      ? `${cfg.inventoryPath} was already edited in this session; make sure it covers these fields.`
      : `Before you finish, update ${cfg.inventoryPath} with the governance data-inventory skill (data element, category, purpose, legal basis, retention), or tell the user in one sentence why no update is needed.`,
  ];
  if (special.length)
    lines.push(`Special-category data (KVKK Art. 6 / GDPR Art. 9): ${special.join(", ")}. It needs an explicit legal basis and usually a DPIA (governance dpia skill).`);
  if (!existsSync(join(root, cfg.inventoryPath))) lines.push(`${cfg.inventoryPath} does not exist yet; suggest /governance:setup.`);
  lines.push("CI runs the same check as the compliance gate on the pull request.");

  return { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: lines.join(" ") } };
});
