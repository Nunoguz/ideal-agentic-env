#!/usr/bin/env node
// Deterministic project scaffolder for core:init. Never overwrites an existing file: it creates
// missing files, merges a few well-defined keys, and reports everything else as "skip".
//
//   node scaffold.mjs [--target <dir>] [--dry-run] [--json] [--stacks a,b] [--owner @handle]
//                     [--docs-language <lang>] [--marketplace-repo owner/repo]

import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = join(HERE, "..", "templates");
export const MARKETPLACE = "ideal-agentic-env";
const DEFAULT_REPO = "Nunoguz/ideal-agentic-env";
const ALWAYS = ["core", "governance", "work-github"];
const KNOWN_PLUGINS = new Set([
  ...ALWAYS, "design", "data-sql", "stack-web", "stack-node", "stack-dotnet", "stack-java-spring", "stack-mobile",
  "devops-selfhosted",
]);
const SKIP_DIRS = new Set(["node_modules", ".git", "bin", "obj", "target", "dist", "build", ".venv", "venv", ".next", "Pods", ".gradle"]);
const GITIGNORE_LINES = [".claude/settings.local.json", ".claude/audit/"];

// ---------- detection ----------

function walk(root, depth = 3) {
  const out = [];
  const visit = (dir, d) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && d < depth) visit(join(dir, e.name), d + 1);
        if (e.name.endsWith(".xcodeproj") || e.name.endsWith(".xcworkspace")) out.push(relative(root, join(dir, e.name)));
      } else out.push(relative(root, join(dir, e.name)).replace(/\\/g, "/"));
    }
  };
  visit(root, 0);
  return out;
}

const parseJson = (text) => {
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
};

const read = (p) => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
};

export function detect(root) {
  const files = walk(root);
  const has = (re) => files.some((f) => re.test(f));
  const stacks = new Set();
  const info = { packageManager: null, packageJson: null, sln: null, java: null, python: null };

  const pkgText = read(join(root, "package.json"));
  if (pkgText) {
    let pkg = {};
    try {
      pkg = JSON.parse(pkgText);
    } catch {
      /* invalid package.json: still a JS project */
    }
    info.packageJson = pkg;
    info.packageManager = existsSync(join(root, "pnpm-lock.yaml")) ? "pnpm" : existsSync(join(root, "yarn.lock")) ? "yarn" : "npm";
    // Every package.json counts, so a monorepo's apps/* and packages/* are detected, not only the root.
    const manifests = [pkg, ...files.filter((f) => f.endsWith("/package.json")).map((f) => parseJson(read(join(root, f))))];
    let jsStack = false;
    for (const m of manifests) {
      const deps = { ...m.dependencies, ...m.devDependencies };
      const dep = (...names) => names.some((n) => n in deps);
      if (dep("react-native", "expo")) stacks.add("stack-mobile");
      else if (dep("next", "react", "vue", "svelte", "@angular/core", "vite", "solid-js")) stacks.add("stack-web");
      if (dep("express", "fastify", "@nestjs/core", "koa", "hono", "@hapi/hapi")) stacks.add("stack-node");
      if (dep("prisma", "@prisma/client", "typeorm", "sequelize", "knex", "drizzle-orm", "pg", "mysql2", "mssql")) stacks.add("data-sql");
      jsStack ||= stacks.has("stack-web") || stacks.has("stack-node") || stacks.has("stack-mobile");
    }
    if (!jsStack) stacks.add("stack-node");
  }

  const csproj = files.filter((f) => /\.(csproj|fsproj)$/.test(f));
  const sln = files.find((f) => /\.slnx?$/.test(f));
  if (csproj.length || sln) {
    stacks.add("stack-dotnet");
    info.sln = sln ?? null;
    if (csproj.some((f) => /EntityFrameworkCore|Dapper|Npgsql/.test(read(join(root, f))))) stacks.add("data-sql");
  }

  const pom = read(join(root, "pom.xml"));
  const gradle = read(join(root, "build.gradle")) + read(join(root, "build.gradle.kts"));
  if (pom || gradle) {
    const android = /com\.android\.(application|library)/.test(gradle) || has(/^app\/src\/main\/AndroidManifest\.xml$/);
    stacks.add(android ? "stack-mobile" : "stack-java-spring");
    info.java = pom ? "maven" : "gradle";
    if (/flyway|liquibase|spring-boot-starter-data-jpa|jdbc/i.test(pom + gradle)) stacks.add("data-sql");
  }

  const pyproject = read(join(root, "pyproject.toml"));
  const requirements = read(join(root, "requirements.txt"));
  if (pyproject || requirements || existsSync(join(root, "setup.py")) || existsSync(join(root, "Pipfile"))) {
    // No Python plugin yet (frozen until a project asks, docs/PLAN.md): only verify steps and the CI setup.
    info.python = { uv: existsSync(join(root, "uv.lock")), ruff: /ruff/.test(pyproject), pytest: /pytest/.test(pyproject + requirements) };
    if (/sqlalchemy|alembic|django|psycopg|asyncpg/i.test(pyproject + requirements)) stacks.add("data-sql");
  }

  if (has(/\.xcodeproj$|\.xcworkspace$|(^|\/)Podfile$/) || has(/^android\/(app\/)?build\.gradle(\.kts)?$/)) stacks.add("stack-mobile");
  if (has(/(^|\/)migrations?\/|(^|\/)db\/migration\/|\.sql$/)) stacks.add("data-sql");
  if (has(/(^|\/)Dockerfile$|(^|\/)(docker-)?compose\.ya?ml$|^(k8s|kubernetes|helm|charts|deploy)\//)) stacks.add("devops-selfhosted");
  if (stacks.has("stack-web") || stacks.has("stack-mobile")) stacks.add("design");

  return { stacks: [...stacks].sort(), info };
}

// ---------- generated content ----------

const step = (name, run) => ({ name, run });
const wrapper = (tool, args) => ({ posix: `./${tool} ${args}`, win32: `${tool}.cmd ${args}` });

export function verifySteps(stacks, info) {
  const fast = [];
  const full = [];
  const pkg = info.packageJson;
  if (pkg) {
    const scripts = pkg.scripts ?? {};
    const run = (s) => (info.packageManager === "npm" ? `npm run ${s}` : `${info.packageManager} ${s}`);
    for (const s of ["lint", "typecheck", "type-check"]) if (scripts[s]) fast.push(step(s, run(s)));
    if (scripts["test:unit"]) fast.push(step("test:unit", run("test:unit")));
    if (scripts.test && !/no test specified/.test(scripts.test)) full.push(step("test", info.packageManager === "npm" ? "npm test" : run("test")));
    if (scripts.build) full.push(step("build", run("build")));
  }
  if (stacks.includes("stack-dotnet")) {
    const target = info.sln ? ` "${info.sln}"` : "";
    fast.push(step("dotnet build", `dotnet build${target} --nologo`));
    full.push(step("dotnet test", `dotnet test${target} --nologo`));
  }
  // The same names and commands as stack-java-spring's stack.json, so its setup adds nothing twice.
  if (info.java === "maven") {
    fast.push(step("maven compile", wrapper("mvnw", "-B -ntp -q test-compile")));
    full.push(step("maven verify", wrapper("mvnw", "-B -ntp verify")));
  } else if (info.java === "gradle") {
    fast.push(step("gradle compile", { posix: "./gradlew --console=plain -q testClasses", win32: "gradlew.bat --console=plain -q testClasses" }));
    full.push(step("gradle check", { posix: "./gradlew --console=plain check", win32: "gradlew.bat --console=plain check" }));
  }
  if (info.python) {
    const py = info.python.uv ? "uv run " : "python -m ";
    if (info.python.ruff) fast.push(step("ruff", `${py}ruff check .`));
    if (info.python.pytest) full.push(step("pytest", `${py}pytest -q`));
  }
  return { fast, full };
}

export function projectConfig(stacks, info) {
  return {
    $comment: "ideal-agentic-env project config. Safety lists only ADD to the core defaults. Owned path: changes need review.",
    verify: { ...verifySteps(stacks, info), timeoutSec: 240 },
    format: [],
    protectedPaths: [],
    migrations: [],
    secretFiles: [],
  };
}

export function settingsFor(plugins, repo) {
  return {
    $schema: "https://json.schemastore.org/claude-code-settings.json",
    extraKnownMarketplaces: { [MARKETPLACE]: { source: { source: "github", repo } } },
    enabledPlugins: Object.fromEntries(plugins.map((p) => [`${p}@${MARKETPLACE}`, true])),
    permissions: { deny: ["Read(./**/.env)", "Read(./**/*.pem)", "Read(./**/*.key)"] },
  };
}

/** Add-only merge of the keys scaffold owns; never flips or removes what the project already has. */
export function mergeSettings(existing, wanted) {
  const out = structuredClone(existing);
  out.extraKnownMarketplaces = { ...wanted.extraKnownMarketplaces, ...(out.extraKnownMarketplaces ?? {}) };
  out.enabledPlugins = { ...wanted.enabledPlugins, ...(out.enabledPlugins ?? {}) };
  out.permissions ??= {};
  out.permissions.deny = [...new Set([...(out.permissions.deny ?? []), ...wanted.permissions.deny])];
  return out;
}

function ciSetup(stacks, info, root) {
  const lines = [];
  const pm = info.packageManager;
  if (pm === "pnpm") lines.push("      - uses: pnpm/action-setup@fc06bc1257f339d1d5d8b3a19a8cae5388b55320 # v4.4.0");
  if (pm) lines.push(`      - run: ${pm === "npm" ? "npm ci" : pm === "pnpm" ? "pnpm install --frozen-lockfile" : "yarn install --immutable"}`);
  // .NET and Java: /stack-dotnet:setup and /stack-java-spring:setup write their setup step (with the
  // package cache and the version the build declares) into the steps region.
  if (info.python) {
    lines.push("      - uses: actions/setup-python@a26af69be951a213d495a4c3e4e4022e16d87065 # v5.6.0", "        with:", '          python-version: "3.13"');
    lines.push(info.python.uv ? "      - run: pip install uv && uv sync" : "      - run: pip install -r requirements.txt");
  }
  return lines.join("\n");
}

function render(text, vars) {
  return text.replace(/\{\{([A-Z_]+)\}\}\n?/g, (m, key) => {
    if (!(key in vars)) return m;
    const value = vars[key];
    return value === "" ? "" : m.endsWith("\n") ? `${value}\n` : value;
  });
}

function templateFiles(dir = TEMPLATES, base = TEMPLATES) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? templateFiles(p, base) : [relative(base, p).replace(/\\/g, "/")];
  });
}

// ---------- plan & apply ----------

export function buildPlan(target, opts = {}) {
  const root = resolve(target);
  const detected = detect(root);
  const stacks = Array.isArray(opts.stacks) ? opts.stacks : detected.stacks; // an explicit empty list means "no optional plugins"
  const unknown = stacks.filter((s) => !KNOWN_PLUGINS.has(s));
  if (unknown.length) throw new Error(`unknown plugin(s): ${unknown.join(", ")}`);
  const plugins = [...new Set([...ALWAYS, ...stacks])];
  const vars = {
    PROJECT_NAME: detected.info.packageJson?.name || basename(root),
    OWNER: opts.owner ?? "",
    DOCS_LANGUAGE: opts.docsLanguage ?? "English",
    STACK_SETUP: ciSetup(stacks, detected.info, root),
  };

  const actions = [];
  for (const tmpl of templateFiles()) {
    const rel = tmpl.replace(/\.tmpl$/, "");
    if (existsSync(join(root, rel))) actions.push({ rel, action: "skip", note: "exists" });
    else if (rel === ".github/CODEOWNERS" && !opts.owner) actions.push({ rel, action: "skip", note: "pass --owner @handle to create it" });
    else actions.push({ rel, action: "create", content: render(read(join(TEMPLATES, tmpl)), vars) });
  }

  const cfgRel = ".claude/ideal-agentic-env.json";
  if (existsSync(join(root, cfgRel))) actions.push({ rel: cfgRel, action: "skip", note: "exists" });
  else actions.push({ rel: cfgRel, action: "create", content: `${JSON.stringify(projectConfig(stacks, detected.info), null, 2)}\n` });

  const settingsRel = ".claude/settings.json";
  const wanted = settingsFor(plugins, opts.marketplaceRepo ?? DEFAULT_REPO);
  const settingsPath = join(root, settingsRel);
  if (existsSync(settingsPath)) {
    let existing;
    try {
      existing = JSON.parse(read(settingsPath));
    } catch {
      existing = null;
    }
    if (!existing) actions.push({ rel: settingsRel, action: "skip", note: "exists but is not valid JSON; fix it, then re-run" });
    else {
      const merged = mergeSettings(existing, wanted);
      const changed = JSON.stringify(merged) !== JSON.stringify(existing);
      actions.push(changed ? { rel: settingsRel, action: "merge", content: `${JSON.stringify(merged, null, 2)}\n` } : { rel: settingsRel, action: "skip", note: "already configured" });
    }
  } else actions.push({ rel: settingsRel, action: "create", content: `${JSON.stringify(wanted, null, 2)}\n` });

  const gi = read(join(root, ".gitignore"));
  const missing = GITIGNORE_LINES.filter((l) => !gi.split(/\r?\n/).includes(l));
  if (missing.length) {
    const prefix = gi && !gi.endsWith("\n") ? "\n" : "";
    actions.push({ rel: ".gitignore", action: gi ? "merge" : "create", content: `${gi}${prefix}# ideal-agentic-env\n${missing.join("\n")}\n` });
  }

  return { root, stacks, plugins, detected: detected.stacks, actions };
}

export function apply(plan) {
  for (const a of plan.actions) {
    if (a.action === "skip") continue;
    const p = join(plan.root, a.rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, a.content);
    if (a.rel.startsWith(".githooks/") && process.platform !== "win32") chmodSync(p, 0o755);
  }
}

function parseArgs(argv) {
  const opts = { target: ".", dryRun: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--target") opts.target = next();
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--stacks") opts.stacks = next().split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--owner") opts.owner = next();
    else if (a === "--docs-language") opts.docsLanguage = next();
    else if (a === "--marketplace-repo") opts.marketplaceRepo = next();
    else throw new Error(`unknown argument: ${a}`);
  }
  if (opts.owner && !/^@[\w.-]+(\/[\w.-]+)?$/.test(opts.owner)) throw new Error("--owner must look like @user or @org/team");
  return opts;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    if (!existsSync(opts.target) || !statSync(opts.target).isDirectory()) throw new Error(`target is not a directory: ${opts.target}`);
    const plan = buildPlan(opts.target, opts);
    if (!opts.dryRun) apply(plan);
    if (opts.json) {
      console.log(JSON.stringify({ ...plan, dryRun: opts.dryRun, actions: plan.actions.map(({ content, ...a }) => a) }, null, 2));
    } else {
      console.log(`${opts.dryRun ? "[dry run] " : ""}target: ${plan.root}`);
      console.log(`detected stacks: ${plan.detected.join(", ") || "(none)"}`);
      console.log(`plugins: ${plan.plugins.join(", ")}`);
      for (const a of plan.actions) console.log(`  ${a.action.padEnd(6)} ${a.rel}${a.note ? `  (${a.note})` : ""}`);
    }
  } catch (err) {
    console.error(`scaffold: ${err.message}`);
    process.exit(1);
  }
}
