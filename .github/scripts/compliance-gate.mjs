#!/usr/bin/env node
// Managed by governance 0.2.0 (ideal-agentic-env). /governance:setup --refresh updates this file while it is unedited; edit it and setup leaves it alone. sha256:f002689c3888ee0c
// Compliance gate (ideal-agentic-env/governance). This is the Law layer for the personal-data inventory.
//
// A pull request fails when all three of these hold:
//   1. It adds lines with personal-data-looking fields to schema files (migrations, models, entities,
//      schemas, contracts).
//   2. The data inventory is unchanged.
//   3. The author has not attested that no update is needed. To attest, tick a PR description
//      checkbox that mentions the "inventory", or add the line "Inventory: not needed — <reason>".
// Either way it writes a compliance report to the job summary.
//
// In CI it reads the pull_request event. Locally:
//   node .github/scripts/compliance-gate.mjs --base origin/main --head HEAD [--body-file pr.md]
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

// ---- personal-data rules: embedded from governance hooks/lib/pii-rules.mjs by governance:setup ----
// Personal-data heuristics (ideal-agentic-env/governance). One source for three consumers:
//   - the inventory-check hook (reminds Claude while it edits a schema file),
//   - the data-inventory skill's scan script (discovery),
//   - the CI compliance gate (.github/scripts/compliance-gate.mjs), into which governance:setup
//     embeds this file verbatim. So this module must stay import-free.
//
// It is a heuristic, not a classifier: it looks for identifier tokens that usually name personal data.
// A false positive costs one sentence ("no inventory change needed because ..."); a miss costs a
// compliance gap, so the list errs on the side of reminding.

// [label, category, special, ...token patterns]. "special" marks KVKK Art. 6 / GDPR Art. 9 categories.
const TERMS = [
  ["name", "identity", false, "first name", "last name", "full name", "surname", "middle name", "given name", "family name", "maiden name", "ad soyad", "adi soyadi"],
  ["national id", "identity", false, "tckn", "tc kimlik", "kimlik no", "national id", "national identity", "identity number", "ssn", "social security", "tax id", "tax number"],
  ["passport", "identity", false, "passport", "pasaport"],
  ["driving licence", "identity", false, "driver license", "drivers license", "driving licence", "driving license", "ehliyet"],
  ["birth date", "identity", false, "birth", "birthday", "birthdate", "dob", "date of birth", "dogum"],
  ["photo of a person", "identity", false, "avatar", "selfie", "profile photo", "profile picture", "vesikalik"],
  ["email", "contact", false, "email", "email address", "e mail", "eposta", "e posta", "mail address"],
  ["phone", "contact", false, "phone", "telephone", "mobile number", "mobile phone", "msisdn", "gsm", "telefon", "cep tel"],
  ["address", "contact", false, "address", "adres", "street", "postal code", "zip code", "postcode", "posta kodu"],
  ["payment card", "financial", false, "card number", "credit card", "cvv", "cvc", "kart no"],
  ["bank account", "financial", false, "iban", "account number", "hesap no"],
  ["income", "financial", false, "salary", "income", "wage", "maas", "gelir"],
  ["online identifier", "online", false, "ip address", "ip addr", "user agent", "device id", "imei", "mac address", "advertising id", "idfa", "gaid"],
  ["location", "location", false, "latitude", "longitude", "geolocation", "geo location", "gps", "konum"],
  ["demographic", "demographic", false, "gender", "cinsiyet", "nationality", "uyruk", "marital status", "medeni hal"],
  ["health", "special", true, "health record", "health data", "health condition", "health info", "saglik bilgi", "saglik durum", "diagnosis", "medical", "medication", "allergy", "disability", "blood type", "kan grubu", "prescription", "recete", "patient", "hasta", "teshis"],
  ["biometric", "special", true, "biometric", "biyometrik", "fingerprint", "parmak izi", "face id", "face template", "iris", "voice print"],
  ["genetic", "special", true, "genetic", "genetik", "dna"],
  ["religion or belief", "special", true, "religion", "religious", "mezhep", "inanc"],
  ["ethnic origin", "special", true, "ethnic", "ethnicity", "race", "irk"],
  ["political opinion", "special", true, "political", "siyasi"],
  ["union or association membership", "special", true, "union membership", "trade union", "sendika", "dernek uyelik"],
  ["sex life or orientation", "special", true, "sexual", "sexual orientation", "cinsel"],
  ["criminal record", "special", true, "criminal", "conviction", "sabika", "adli sicil"],
];

// Files where new personal data usually first appears: migrations, schemas, ORM models and entities.
export const SCHEMA_PATTERNS = [
  /(^|\/)migrations?\//i,
  /(^|\/)db\/migrate\//i,
  /(^|\/)db\/migration\//i,
  /(^|\/)alembic\/versions\//i,
  /\.sql$/i,
  /\.prisma$/i,
  /(^|\/)db\/schema\.rb$/i,
  /(^|\/)(schema|schemas)\.(ts|js|mjs|py|rb|graphql|gql)$/i,
  /(^|\/)(schema|schemas)\/[^/]+\.(ts|js|mjs|py|graphql|gql)$/i,
  /\.(graphql|gql|proto|avsc)$/i,
  /(^|\/)(entities|entity|models|model)\/.+\.(cs|java|kt|ts|js|mjs|py|go|rb|php|swift)$/i,
  /\.(entity|model|schema)\.(ts|js|mjs)$/i,
  /Entity\.(cs|java|kt)$/,
  /(^|\/)models\.py$/i,
];

export const DEFAULT_INVENTORY_PATH = "docs/compliance/data-inventory.md";

const FOLD = { ç: "c", Ç: "C", ğ: "g", Ğ: "G", ı: "i", İ: "I", ö: "o", Ö: "O", ş: "s", Ş: "S", ü: "u", Ü: "U" };

/** Identifier tokens of `text`: snake, kebab and camel case split, Turkish letters folded, lower-cased. */
export function tokens(text) {
  return String(text)
    .replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => FOLD[c])
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function compile(extraTerms = []) {
  const rules = TERMS.map(([label, category, special, ...patterns]) => ({ label, category, special, patterns: patterns.map(tokens) }));
  for (const t of extraTerms) {
    if (typeof t === "string" && tokens(t).length) rules.push({ label: t, category: "project", special: false, patterns: [tokens(t)] });
  }
  return rules;
}

function occurrences(haystack, needle) {
  const at = [];
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    at.push(i);
  }
  return at;
}

/**
 * Personal-data terms found in `text`, one entry per label, in list order: [{ label, category, special }].
 * Longer patterns claim their tokens first, so "ip_address" is an online identifier, not also an address.
 */
export function findPersonalData(text, extraTerms = []) {
  const toks = tokens(text);
  if (!toks.length) return [];
  const rules = compile(extraTerms);
  const candidates = rules.flatMap((rule, order) => rule.patterns.map((p) => ({ order, p }))).sort((a, b) => b.p.length - a.p.length);
  const claimed = new Array(toks.length).fill(false);
  const hit = new Set();
  for (const { order, p } of candidates) {
    for (const i of occurrences(toks, p)) {
      if (claimed.slice(i, i + p.length).some(Boolean)) continue;
      for (let k = i; k < i + p.length; k++) claimed[k] = true;
      hit.add(order);
    }
  }
  return rules.filter((_, order) => hit.has(order)).map(({ label, category, special }) => ({ label, category, special }));
}

/** Minimal glob for project-configured schema paths: `**` spans directories, `*` stays in one segment. */
export function globRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      const slash = glob[i + 2] === "/";
      re += slash ? "(?:.*/)?" : ".*";
      i += slash ? 2 : 1;
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, "i"); // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp -- compiled from repo-owned globs with every metacharacter escaped; only .* and [^/]* quantifiers, matched against bounded paths
}

export function isSchemaPath(rel, extraGlobs = []) {
  const path = String(rel).replace(/\\/g, "/");
  return SCHEMA_PATTERNS.some((re) => re.test(path)) || extraGlobs.some((g) => typeof g === "string" && globRegExp(g).test(path));
}

/** The "governance" section of .claude/ideal-agentic-env.json, normalized. Unknown or invalid values fall back to defaults. */
export function governanceConfig(projectConfig) {
  const g = projectConfig && typeof projectConfig === "object" && projectConfig.governance && typeof projectConfig.governance === "object" ? projectConfig.governance : {};
  const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : []);
  return {
    schemaPaths: strings(g.schemaPaths),
    piiTerms: strings(g.piiTerms),
    inventoryPath: typeof g.inventoryPath === "string" && g.inventoryPath.trim() ? g.inventoryPath.trim() : DEFAULT_INVENTORY_PATH,
  };
}

export function describe(findings) {
  return findings.map((f) => `${f.label} (${f.special ? "special category" : f.category})`).join(", ");
}
// ---- end of embedded rules ----

const MAX_REPORTED = 50;

function git(args) {
  const r = spawnSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr.trim()}`);
  return r.stdout;
}

/** Added lines per file from `git diff -U0` output: Map<path, [{ line, text }]>. */
export function parseDiff(text) {
  const files = new Map();
  let current = null;
  let line = 0;
  for (const raw of text.split("\n")) {
    if (raw.startsWith("+++ ")) {
      const path = raw.slice(4).replace(/^b\//, "");
      current = path === "/dev/null" ? null : path;
      if (current && !files.has(current)) files.set(current, []);
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      line = Number(hunk[1]);
      continue;
    }
    if (current && raw.startsWith("+")) files.get(current).push({ line: line++, text: raw.slice(1) });
  }
  return files;
}

export function attested(body) {
  const text = String(body ?? "");
  return /^\s*[-*]\s*\[[xX]\][^\n]*\b(inventory|envanter)/im.test(text) || /^\s*(inventory|envanter)\s*:\s*(not needed|gerekmiyor)/im.test(text);
}

/** Findings and verdict for one pull request. `added` is the parseDiff() result. */
export function evaluate({ changed, added, body, cfg }) {
  const schemaFiles = changed.filter((f) => isSchemaPath(f, cfg.schemaPaths));
  const findings = [];
  for (const file of schemaFiles) {
    for (const { line, text } of added.get(file) ?? []) {
      const found = findPersonalData(text, cfg.piiTerms);
      if (found.length) findings.push({ file, line, found });
    }
  }
  const inventoryChanged = changed.includes(cfg.inventoryPath);
  const isAttested = attested(body);
  const pass = !findings.length || inventoryChanged || isAttested;
  return { changed, schemaFiles, findings, inventoryChanged, attested: isAttested, pass, inventoryPath: cfg.inventoryPath };
}

export function renderReport(r) {
  const special = [...new Set(r.findings.flatMap((f) => f.found.filter((x) => x.special).map((x) => x.label)))];
  const fields = r.findings
    .slice(0, MAX_REPORTED)
    .map((f) => `\`${f.file}:${f.line}\` ${describe(f.found)}`)
    .join("<br>");
  const more = r.findings.length > MAX_REPORTED ? ` (+${r.findings.length - MAX_REPORTED} more)` : "";
  const verdict = r.pass
    ? "✅ pass"
    : `❌ fail: personal-data fields were added but \`${r.inventoryPath}\` is unchanged and there is no attestation`;
  return [
    "## Compliance report",
    "",
    "| Check | Result |",
    "| --- | --- |",
    `| Changed files | ${r.changed.length} |`,
    `| Schema files changed | ${r.schemaFiles.length ? r.schemaFiles.map((f) => `\`${f}\``).join(", ") : "none"} |`,
    `| Personal-data-looking fields added | ${fields ? fields + more : "none"} |`,
    `| Special-category data (KVKK Art. 6 / GDPR Art. 9) | ${special.length ? special.join(", ") : "none"} |`,
    `| Data inventory updated | ${r.inventoryChanged ? "yes" : "no"} |`,
    `| Author attestation | ${r.attested ? "yes" : "no"} |`,
    `| Result | ${verdict} |`,
    "",
    r.pass
      ? ""
      : `Update \`${r.inventoryPath}\` (governance \`data-inventory\` skill), or, if no inventory change is needed, tick the data-inventory checkbox in the PR description or add \`Inventory: not needed — <reason>\`.`,
  ].join("\n");
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function inputs(argv) {
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  if (arg("--base")) {
    const bodyFile = arg("--body-file");
    return { base: arg("--base"), head: arg("--head") ?? "HEAD", body: bodyFile ? readFileSync(bodyFile, "utf8") : "" };
  }
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const pr = eventPath && existsSync(eventPath) ? readJson(eventPath)?.pull_request : null;
  if (!pr) throw new Error("not a pull_request event; pass --base <ref> [--head <ref>] to run locally");
  return { base: pr.base.sha, head: pr.head.sha, body: pr.body ?? "" };
}

const isMain = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const { base, head, body } = inputs(process.argv.slice(2));
    const range = `${base}...${head}`;
    const changed = git(["diff", "--name-only", "--no-renames", range]).split("\n").filter(Boolean);
    const added = parseDiff(git(["diff", "-U0", "--no-color", "--no-ext-diff", "--diff-filter=AMR", range]));
    const cfg = governanceConfig(readJson(".claude/ideal-agentic-env.json"));
    const result = evaluate({ changed, added, body, cfg });
    const report = renderReport(result);
    console.log(report);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
    if (!result.pass) {
      for (const f of result.findings.slice(0, 20))
        console.log(`::error file=${f.file},line=${f.line}::Personal-data-looking field (${describe(f.found)}) without a data inventory update or attestation`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`compliance-gate: ${err.message}`);
    process.exit(2);
  }
}
