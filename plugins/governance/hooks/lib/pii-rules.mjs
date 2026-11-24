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
