// Best-effort shell parsing for guards (bash, zsh, PowerShell, cmd). It is a safety net, not a parser:
// quotes are honoured, backslashes are kept literally (so Windows paths survive), and the command is
// split into segments on unquoted | || && ; & and newlines.

const WRAPPERS = new Set(["sudo", "doas", "env", "command", "exec", "nohup", "time", "nice", "xargs"]);

export function splitSegments(command) {
  const segments = [];
  let current = "";
  let quote = null;
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      if (c === quote) quote = null;
      current += c;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      current += c;
      continue;
    }
    if (c === "\n" || c === ";" || c === "|" || c === "&") {
      if (current.trim()) segments.push(current.trim());
      current = "";
      if ((c === "|" || c === "&") && command[i + 1] === c) i++;
      continue;
    }
    current += c;
  }
  if (current.trim()) segments.push(current.trim());
  return segments.map(parseSegment);
}

export function tokenize(segment) {
  const tokens = [];
  let current = "";
  let quote = null;
  let has = false;
  for (const c of segment) {
    if (quote) {
      if (c === quote) quote = null;
      else current += c;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      has = true;
      continue;
    }
    if (/\s/.test(c)) {
      if (has || current) tokens.push(current);
      current = "";
      has = false;
      continue;
    }
    current += c;
    has = true;
  }
  if (has || current) tokens.push(current);
  return tokens;
}

function parseSegment(raw) {
  const tokens = tokenize(raw);
  let i = 0;
  let elevated = false;
  while (i < tokens.length) {
    const t = tokens[i];
    const base = programName(t);
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) i++;
    else if (WRAPPERS.has(base)) {
      if (base === "sudo" || base === "doas") elevated = true;
      i++;
      while (i < tokens.length && tokens[i].startsWith("-")) i++;
    } else break;
  }
  const program = i < tokens.length ? programName(tokens[i]) : "";
  return { raw, tokens, program, args: tokens.slice(i + 1), elevated };
}

export function programName(token) {
  const last = String(token).split(/[\\/]/).pop() ?? "";
  return last.toLowerCase().replace(/\.(exe|cmd|bat|ps1)$/, "");
}

/** Subcommand of tools like git/gh/kubectl: first non-option argument, skipping options that take values. */
export function subcommand(args, optionsWithValue = []) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (optionsWithValue.includes(a)) {
      i++;
      continue;
    }
    if (!a.startsWith("-")) return { name: a.toLowerCase(), rest: args.slice(i + 1) };
  }
  return { name: "", rest: [] };
}
