// Secret protection: files Claude must not read, and secrets Claude must not write.

import { isAbsolute, resolve } from "node:path";
import { matchesAny, toPosix } from "./paths.mjs";
import { splitSegments, subcommand } from "./shell.mjs";

const READERS = new Set([
  "cat", "bat", "less", "more", "head", "tail", "nl", "tac", "sed", "awk", "gawk", "grep", "egrep", "fgrep", "rg", "ag",
  "strings", "xxd", "od", "hexdump", "base64", "cut", "sort", "jq", "yq", "source", ".", "type", "get-content", "gc",
  "select-string", "sls", "findstr", "scp", "rsync", "pbcopy", "xclip", "vi", "vim", "nvim", "nano", "code", "openssl",
]);

export function isSecretFile(path, cfg, root = process.cwd()) {
  if (!path) return false;
  const abs = toPosix(isAbsolute(path) ? path : resolve(root, path));
  const rel = toPosix(path);
  const opts = { nocase: process.platform === "win32" };
  const hit = (p) => matchesAny(p, cfg.secretFiles, opts) && !matchesAny(p, cfg.secretFilesAllow, opts);
  return hit(rel) || hit(abs);
}

/** Bash/PowerShell: reading or staging a secret file. */
export function checkShellForSecrets(command, cfg, root) {
  if (typeof command !== "string") return [];
  const findings = [];
  for (const seg of splitSegments(command)) {
    const candidates = [];
    seg.tokens.forEach((t, i) => {
      if (t === "<" && seg.tokens[i + 1]) candidates.push({ path: seg.tokens[i + 1], redirect: true });
      else if (t.startsWith("<") && t.length > 1) candidates.push({ path: t.slice(1), redirect: true });
      else candidates.push({ path: t.includes("=") ? t.split("=").pop() : t, redirect: false });
    });
    const secrets = candidates.filter((c) => c.path && !c.path.startsWith("-") && isSecretFile(c.path, cfg, root));
    if (!secrets.length) continue;
    const names = secrets.map((s) => s.path).join(", ");
    if (READERS.has(seg.program) || secrets.some((s) => s.redirect))
      findings.push({ decision: "deny", reason: `reading a secret file (${names}); ask the user for the specific non-secret value you need` });
    else if (seg.program === "git" && ["add", "stage"].includes(subcommand(seg.args, ["-C", "-c"]).name))
      findings.push({ decision: "deny", reason: `staging a secret file (${names}); secrets never enter git` });
  }
  return findings;
}

// High-confidence formats: always deny. Built from parts so this file never matches itself.
const KNOWN = [
  ["private key", new RegExp("-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY" + "-----")],
  ["AWS access key id", new RegExp("\\b(?:AKIA|ASIA)" + "[0-9A-Z]{16}\\b")],
  ["GitHub token", new RegExp("\\bgh[pousr]_" + "[A-Za-z0-9]{36,}\\b")],
  ["GitHub fine-grained token", new RegExp("\\bgithub_pat_" + "[A-Za-z0-9_]{60,}\\b")],
  ["Slack token", new RegExp("\\bxox[abposr]-" + "[A-Za-z0-9-]{10,}")],
  ["Stripe live key", new RegExp("\\b[rs]k_live_" + "[0-9A-Za-z]{20,}\\b")],
  ["Google API key", new RegExp("\\bAIza" + "[0-9A-Za-z_-]{35}\\b")],
  ["Anthropic API key", new RegExp("\\bsk-ant-" + "[A-Za-z0-9_-]{30,}")],
  ["OpenAI API key", new RegExp("\\bsk-(?:proj-)?" + "[A-Za-z0-9_-]{40,}")],
  ["npm token", new RegExp("\\bnpm_" + "[A-Za-z0-9]{36}\\b")],
  ["Azure storage key", new RegExp("AccountKey=" + "[A-Za-z0-9+/]{80,}={0,2}")],
];
// Generic assignments: ask, because tests and docs legitimately contain look-alikes.
const GENERIC = /\b(password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)\b["']?\s*[:=]\s*["']([^"'\s]{12,})["']/gi;
const PLACEHOLDER = /example|sample|dummy|fake|test|changeme|placeholder|redacted|your[_-]|xxxx|\*\*\*|<|>|\{\{|\$\{|%\(|\benv\b/i;

export function scanContent(text) {
  if (typeof text !== "string" || !text) return [];
  const findings = [];
  for (const [name, re] of KNOWN) {
    const m = re.exec(text);
    if (m && !/EXAMPLE/.test(m[0])) findings.push({ decision: "deny", reason: `content contains a ${name}; use an environment variable or secret store instead` });
  }
  for (const m of text.matchAll(GENERIC)) {
    if (!PLACEHOLDER.test(m[2])) {
      findings.push({ decision: "ask", reason: `content assigns a literal value to "${m[1]}"; confirm it is not a real secret` });
      break;
    }
  }
  return findings;
}

/** Text a Write/Edit/MultiEdit/NotebookEdit call would put on disk. */
export function writtenText(toolName, toolInput = {}) {
  switch (toolName) {
    case "Write":
      return toolInput.content ?? "";
    case "Edit":
      return toolInput.new_string ?? "";
    case "MultiEdit":
      return (toolInput.edits ?? []).map((e) => e?.new_string ?? "").join("\n");
    case "NotebookEdit":
      return toolInput.new_source ?? "";
    default:
      return "";
  }
}
