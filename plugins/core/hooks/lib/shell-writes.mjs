// Files a shell command writes to or deletes, best effort. edit-guard protects paths against the Edit and
// Write tools; this closes the obvious shell route around it (heredoc redirection, tee, sed -i, cp, rm).
// It is a safety net: a script that writes files internally (node x.mjs) is not visible here. The Law
// layer (CODEOWNERS + PR review + CI) is the boundary.
import { splitSegments, tokenize } from "./shell.mjs";

const SINKS = new Set(["/dev/null", "/dev/stdout", "/dev/stderr", "nul", "$null", "&1", "&2"]);
// Options whose next token is a value, not a file.
const SED_VALUE = new Set(["-e", "--expression", "-f", "--file", "-l", "--line-length", "-s"]);
const COPY_VALUE = new Set(["-S", "--suffix", "-m", "--mode", "-o", "--owner", "-g", "--group"]);
const PS_PATH = new Set(["-path", "-literalpath", "-filepath", "-destination"]);
const PS_WRITERS = new Set(["set-content", "add-content", "out-file", "new-item", "remove-item", "copy-item", "move-item", "clear-content", "sc", "ac", "ni", "ri", "del", "erase", "rd", "rmdir"]);

const positional = (args, valueOpts = new Set()) => {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--") {
      out.push(...args.slice(i + 1));
      break;
    }
    if (valueOpts.has(a)) i++;
    else if (!a.startsWith("-")) out.push(a);
  }
  return out;
};

/** Redirection targets inside one segment: `> f`, `>>f`, `2> f`, `&> f`, `echo x>f`. Over-matches `=>` in code, which is harmless here. */
function redirections(raw) {
  const out = [];
  const tokens = tokenize(raw);
  for (let i = 0; i < tokens.length; i++) {
    const at = tokens[i].lastIndexOf(">");
    if (at < 0) continue;
    const target = tokens[i].slice(at + 1) || tokens[i + 1];
    if (target && !target.startsWith("&")) out.push(target);
  }
  return out;
}

function programTargets({ program, args }) {
  switch (program) {
    case "tee":
      return positional(args);
    case "sed":
    case "gsed": {
      if (!args.some((a) => /^-[a-zA-Z]*i/.test(a) || a.startsWith("--in-place"))) return [];
      const files = positional(args, SED_VALUE);
      // Without -e/-f the first positional argument is the script.
      return args.some((a) => SED_VALUE.has(a)) ? files : files.slice(1);
    }
    case "perl":
      return args.some((a) => /^-[a-zA-Z]*i/.test(a)) ? positional(args, new Set(["-e", "-E", "-M", "-I"])) : [];
    case "cp":
    case "mv":
    case "install":
    case "ln":
    case "rsync": {
      const t = args.findIndex((a) => a === "-t" || a === "--target-directory");
      if (t >= 0 && args[t + 1]) return [args[t + 1]];
      const files = positional(args, COPY_VALUE);
      return files.length >= 2 ? [files[files.length - 1]] : [];
    }
    case "rm":
    case "unlink":
    case "rmdir":
    case "truncate":
    case "touch":
    case "shred":
      return positional(args, new Set(["-s", "--size", "-r", "--reference"]));
    case "dd":
      return args.filter((a) => a.startsWith("of=")).map((a) => a.slice(3));
    case "copy":
    case "move":
    case "xcopy":
    case "robocopy": {
      const files = args.filter((a) => !a.startsWith("/"));
      return files.length >= 2 ? [files[files.length - 1]] : [];
    }
    default:
      if (!PS_WRITERS.has(program)) return [];
      for (let i = 0; i < args.length; i++) {
        if (PS_PATH.has(args[i].toLowerCase()) && args[i + 1]) return [args[i + 1]];
      }
      return args.filter((a) => !a.startsWith("-") && !a.startsWith("/")).slice(0, 1);
  }
}

/** Every path the command appears to write, create, move onto or delete. */
export function shellWriteTargets(command) {
  if (typeof command !== "string" || !command) return [];
  const targets = [];
  for (const seg of splitSegments(command)) {
    targets.push(...redirections(seg.raw), ...programTargets(seg));
  }
  return [...new Set(targets.filter((t) => t && !SINKS.has(t.toLowerCase()) && !/^[<>|]/.test(t)))];
}
