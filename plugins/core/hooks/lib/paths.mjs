// Path helpers for hooks. Shared file: the source of truth is shared/hooks-lib/ (npm run sync).
import { isAbsolute, relative, resolve } from "node:path";

export function projectDir(input = {}) {
  return process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
}

export function toPosix(p) {
  return String(p).replace(/\\/g, "/");
}

/** Path of `file` relative to `root`, with forward slashes. Starts with "../" when outside. */
export function relPosix(root, file) {
  const abs = isAbsolute(file) ? file : resolve(root, file);
  return toPosix(relative(root, abs)) || ".";
}

export function isOutside(rel) {
  return rel === ".." || rel.startsWith("../") || isAbsolute(rel);
}

const cache = new Map();

/** Minimal glob: `**` spans directories, `*` and `?` stay within one segment, `{a,b}` is an alternation
 *  (not nested). Whole-string match. */
export function globToRegExp(glob, { nocase = false } = {}) {
  const key = `${nocase}:${glob}`;
  if (cache.has(key)) return cache.get(key);
  let re = "";
  let inBraces = false;
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "{" && !inBraces && glob.indexOf("}", i) > i) {
      inBraces = true;
      re += "(?:";
    } else if (c === "}" && inBraces) {
      inBraces = false;
      re += ")";
    } else if (c === "," && inBraces) re += "|";
    else if (c === "*") {
      if (glob[i + 1] === "*") {
        const slash = glob[i + 2] === "/";
        re += slash ? "(?:.*/)?" : ".*";
        i += slash ? 2 : 1;
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  const compiled = new RegExp(`^${re}$`, nocase ? "i" : ""); // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp -- compiled from repo-owned globs with every metacharacter escaped; only .* and [^/]* quantifiers, matched against bounded paths
  cache.set(key, compiled);
  return compiled;
}

export function matchesAny(path, globs, opts) {
  return globs.some((g) => globToRegExp(g, opts).test(path));
}
