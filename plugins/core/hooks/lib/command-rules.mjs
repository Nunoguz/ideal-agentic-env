// Dangerous-command rules for Bash and PowerShell tool calls.
// deny = catastrophic or never legitimate for an agent; ask = legitimate but needs a human.

import { splitSegments, subcommand } from "./shell.mjs";

const ROOT_OR_HOME = new Set([
  "/", "/*", "~", "~/*", "$home", "${home}", "$home/*", "..", "../*",
  "/home", "/users", "/etc", "/var", "/usr", "/opt", "c:", "c:\\", "c:/", "c:\\*", "c:/*",
  "$env:userprofile", "$env:systemroot", "%userprofile%", "%systemroot%",
]);
const WHOLE_TREE = new Set([".", "./*", "*", ".\\*"]);
const PROTECTED_BRANCH = /^(\+)?(refs\/heads\/)?(main|master|develop|trunk|release[\w./-]*|prod(uction)?)$/i;

const deny = (reason) => ({ decision: "deny", reason });
const ask = (reason) => ({ decision: "ask", reason });

function inSet(set, arg) {
  const a = arg.toLowerCase();
  return set.has(a) || set.has(a.replace(/[\\/]+$/, ""));
}
const isRootish = (arg) => inSet(ROOT_OR_HOME, arg);

function recursiveFlag(args) {
  return args.some((a) => /^-[a-z]*r[a-z]*$/i.test(a) || /^--recursive$/i.test(a) || /^-recurse$/i.test(a) || /^\/s$/i.test(a));
}

function checkSegment(seg, ctx) {
  const { program, args } = seg;
  const lower = args.map((a) => a.toLowerCase());

  // Recursive deletes of a root, home or the whole working tree.
  if (["rm", "remove-item", "ri", "del", "erase", "rd", "rmdir"].includes(program) && recursiveFlag(args)) {
    const targets = args.filter((a) => !a.startsWith("-") && !/^\/[a-z]$/i.test(a));
    if (targets.some(isRootish)) return deny(`recursive delete of a root or home directory (${seg.raw})`);
    if (targets.some((t) => inSet(WHOLE_TREE, t))) return ask(`recursive delete of the whole working directory (${seg.raw})`);
  }

  if (["mkfs", "format-volume", "clear-disk", "diskpart", "fdisk"].includes(program) || program.startsWith("mkfs."))
    return deny(`disk-level destructive command (${program})`);
  if (program === "dd" && lower.some((a) => a.startsWith("of=/dev/"))) return deny("dd writing to a raw device");
  if (program === "chmod" && recursiveFlag(args) && lower.includes("777") && args.some(isRootish))
    return deny("recursive chmod 777 on a root path");

  if (program === "git") return checkGit(args, ctx);
  if (program === "gh") {
    const sub = subcommand(args, ["-R", "--repo"]);
    const action = subcommand(sub.rest).name;
    if (sub.name === "repo" && action === "delete") return deny("deleting a GitHub repository");
    if (sub.name === "pr" && action === "merge") return ask("merging a pull request is a human decision");
    if (sub.name === "release" && action === "create") return ask("publishing a release");
    if (sub.name === "secret" || (sub.name === "api" && lower.some((a) => /^(-x|--method)$/.test(a)) && lower.includes("delete")))
      return ask(`gh ${sub.name} changes repository state or secrets`);
  }

  if (program === "kubectl") {
    const sub = subcommand(args, ["-n", "--namespace", "--context", "--kubeconfig"]);
    if (sub.name === "delete") {
      if (lower.some((a) => ["--all", "-a", "--all-namespaces"].includes(a))) return deny("kubectl delete across all resources/namespaces");
      return ask("kubectl delete");
    }
    if (prodContext(lower)) return ask("kubectl against a production context");
  }
  if (program === "helm") {
    const sub = subcommand(args, ["-n", "--namespace", "--kube-context"]);
    if (["uninstall", "delete", "del", "un"].includes(sub.name)) return ask("helm uninstall");
    if (prodContext(lower)) return ask("helm against a production context");
  }
  if (["terraform", "tofu", "pulumi"].includes(program)) {
    const sub = subcommand(args, ["-chdir"]);
    if (sub.name === "destroy") return ask(`${program} destroy`);
    if (sub.name === "apply" && lower.some((a) => a === "-auto-approve" || a === "--yes")) return ask(`${program} apply without review`);
  }
  if (program === "docker") {
    const s = lower.join(" ");
    if (/\b(system|volume|image|container|builder) prune\b/.test(s) || /\bvolume (rm|remove)\b/.test(s)) return ask("docker prune/volume removal");
    if (/\bcompose\b.*\bdown\b.*(-v\b|--volumes\b)/.test(s)) return ask("docker compose down with volume removal");
  }
  if ((program === "npm" || program === "pnpm" || program === "yarn") && lower[0] === "publish") return ask("publishing a package");
  if (program === "dotnet" && lower[0] === "nuget" && lower[1] === "push") return ask("publishing a NuGet package");
  if ((program === "mvn" || program === "mvnw" || program === "gradle" || program === "gradlew") && lower.some((a) => a === "deploy" || a === "publish"))
    return ask("publishing a build artifact");
  if (program === "twine" && lower[0] === "upload") return ask("publishing a Python package");

  if (seg.elevated) return ask(`elevated command (sudo): ${seg.raw}`);
  return null;
}

function prodContext(lowerArgs) {
  return lowerArgs.some((a, i) => {
    const value = a.includes("=") ? a.split("=")[1] : ["--context", "--kube-context"].includes(a) ? lowerArgs[i + 1] : null;
    return value != null && /prod/.test(value);
  });
}

function resolveHead(target, ctx) {
  return /^(HEAD|@)$/i.test(target) ? ctx.currentBranch ?? target : target;
}

function checkGit(args, ctx) {
  const sub = subcommand(args, ["-C", "-c", "--git-dir", "--work-tree"]);
  const rest = sub.rest;
  const lower = rest.map((a) => a.toLowerCase());
  const has = (...flags) => lower.some((a) => flags.includes(a));

  switch (sub.name) {
    case "push": {
      if (has("--mirror")) return deny("git push --mirror overwrites every remote ref");
      const force = has("--force", "-f", "--force-with-lease", "--force-if-includes") || lower.some((a) => a.startsWith("--force-with-lease="));
      const refspecs = rest.filter((a) => !a.startsWith("-")).slice(1);
      if (refspecs.some((r) => r.startsWith(":")) || has("--delete", "-d")) return ask("deleting a remote branch");
      if (has("--all", "--branches"))
        return force ? deny("force push of every branch, including protected ones") : ask("git push --all pushes every local branch, including protected ones");
      // Without a refspec git pushes the current branch (push.default=simple); HEAD names it explicitly.
      const pushes = refspecs.length
        ? refspecs.map((r) => ({ forced: force || r.startsWith("+"), target: resolveHead(r.replace(/^\+/, "").split(":").pop(), ctx) }))
        : has("--tags")
          ? []
          : [{ forced: force, target: ctx.currentBranch ?? null }];
      const toProtected = pushes.filter((p) => p.target && PROTECTED_BRANCH.test(p.target));
      if (toProtected.some((p) => p.forced)) return deny("force push to a protected branch");
      if (force || pushes.some((p) => p.forced)) return ask("force push rewrites remote history");
      if (toProtected.length)
        return ask(
          `direct push to protected branch ${toProtected[0].target} bypasses pull-request review and CI; open a PR instead unless the user explicitly asked for this push`,
        );
      if (has("--no-verify")) return ask("git push --no-verify skips the repository's checks");
      return null;
    }
    case "reset":
      return has("--hard", "--merge", "--keep") ? ask("git reset discards local work") : null;
    case "clean":
      return lower.some((a) => /^-[a-z]*f/.test(a) || a === "--force") ? ask("git clean deletes untracked files") : null;
    case "checkout":
    case "restore":
      return rest.includes(".") || rest.includes(":/") ? ask(`git ${sub.name} . discards all local changes`) : null;
    case "branch":
      return rest.includes("-D") || (has("--delete", "-d") && has("--force", "-f")) ? ask("force-deleting a branch") : null;
    case "stash":
      return ["drop", "clear"].includes(lower[0]) ? ask("dropping stashed work") : null;
    case "filter-branch":
    case "filter-repo":
      return ask("rewriting repository history");
    case "commit":
      return has("--no-verify", "-n") ? ask("git commit --no-verify skips the repository's checks") : null;
    case "update-ref":
      return has("-d") ? ask("deleting a ref") : null;
    default:
      return null;
  }
}

const RAW_RULES = [
  {
    test: /\b(curl|wget|iwr|irm|invoke-webrequest|invoke-restmethod)\b[^|\n]*\|\s*(sudo\s+)?(sh|bash|zsh|fish|dash|ksh|iex|invoke-expression|python3?|node|pwsh|powershell)\b/i,
    finding: deny("piping a download straight into an interpreter"),
  },
  { test: /\b(iex|invoke-expression)\s*\(\s*(new-object\s+net\.webclient|iwr|irm|invoke-webrequest|invoke-restmethod)/i, finding: deny("executing downloaded PowerShell") },
  { test: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, finding: deny("fork bomb") },
  { test: /\bdrop\s+(database|schema)\b/i, finding: deny("DROP DATABASE/SCHEMA") },
  { test: /\b(drop\s+table|truncate\s+(table\s+)?\w)/i, finding: ask("SQL that drops or truncates a table") },
  { test: /\bdelete\s+from\s+[\w."`\[\]]+\s*(;|$|["'`)])/im, finding: ask("DELETE without a WHERE clause") },
  { test: /\balter\s+table\b[^;]*\bdrop\s+(column|constraint)\b/i, finding: ask("ALTER TABLE ... DROP") },
];

/** Project rules from .claude/ideal-agentic-env.json (`guardedCommands`), compiled once; invalid ones are skipped. */
function compileGuards(guards = []) {
  const out = [];
  for (const g of guards) {
    try {
      out.push({ re: new RegExp(g.pattern, "i"), finding: { decision: g.decision, reason: `${g.reason} (project rule)` } }); // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp -- patterns come from the protected, CODEOWNERS-owned project config and are length-capped in loadConfig
    } catch {
      /* an invalid pattern never weakens the built-in rules; it is ignored */
    }
  }
  return out;
}

/**
 * All findings for one shell command string.
 * `ctx.currentBranch` (optional) lets a bare `git push` be judged by the branch it would push.
 * `ctx.guarded` (optional) adds the project's guardedCommands, matched against each segment.
 */
export function checkCommand(command, ctx = {}) {
  if (typeof command !== "string" || !command.trim()) return [];
  const findings = [];
  const guards = compileGuards(ctx.guarded);
  for (const rule of RAW_RULES) if (rule.test.test(command)) findings.push(rule.finding);
  for (const seg of splitSegments(command)) {
    const f = checkSegment(seg, ctx);
    if (f) findings.push(f);
    const text = [seg.program, ...seg.args].join(" ");
    for (const g of guards) if (g.re.test(text)) findings.push(g.finding);
  }
  return findings;
}
