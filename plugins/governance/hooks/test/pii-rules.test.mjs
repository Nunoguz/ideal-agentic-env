import { test } from "node:test";
import assert from "node:assert/strict";
import { findPersonalData, governanceConfig, isSchemaPath, tokens } from "../lib/pii-rules.mjs";

const labels = (text, extra) => findPersonalData(text, extra).map((f) => f.label);

test("tokens split snake, kebab and camel case and fold Turkish letters", () => {
  assert.deepEqual(tokens("dateOfBirth"), ["date", "of", "birth"]);
  assert.deepEqual(tokens("TCKimlikNo"), ["tc", "kimlik", "no"]);
  assert.deepEqual(tokens("IPAddress e_mail"), ["ip", "address", "e", "mail"]);
  assert.deepEqual(tokens("doğum_tarihi"), ["dogum", "tarihi"]);
});

test("common personal-data fields are found across languages and casing", () => {
  assert.deepEqual(labels("ALTER TABLE users ADD COLUMN email text;"), ["email"]);
  assert.deepEqual(labels("firstName String\nlastName String"), ["name"]);
  assert.deepEqual(labels("tckn varchar(11), dogum_tarihi date"), ["national id", "birth date"]);
  assert.deepEqual(labels("public string PhoneNumber { get; set; }"), ["phone"]);
  assert.deepEqual(labels("ip_address inet, user_agent text"), ["online identifier"]);
  assert.deepEqual(labels("email_address text"), ["email"]);
});

test("special categories are flagged", () => {
  const found = findPersonalData("blood_type text, diagnosis_code text");
  assert.deepEqual(found, [{ label: "health", category: "special", special: true }]);
  assert.ok(findPersonalData("fingerprint_template bytea")[0].special);
});

test("technical look-alikes are not flagged", () => {
  for (const text of ["CREATE INDEX idx_orders_created_at ON orders(created_at);", "health_check boolean", "webhook_signature text", "product_photo_url text", "mobile_app_version text", "address_book_enabled boolean IS NOT address"])
    if (text.startsWith("address_book")) assert.deepEqual(labels(text), ["address"], "address is intentionally broad");
    else assert.deepEqual(labels(text), [], text);
});

test("project terms extend the list", () => {
  assert.deepEqual(labels("customer_number int", ["customer number"]), ["customer number"]);
});

test("schema paths cover migrations, ORMs and contracts", () => {
  for (const p of ["db/migrations/0003_users.sql", "prisma/schema.prisma", "src/main/resources/db/migration/V3__x.sql", "app/models.py", "src/users/user.entity.ts", "src/Domain/Entities/Customer.cs", "api/schema.graphql", "src/db/schema.ts"])
    assert.ok(isSchemaPath(p), p);
  for (const p of ["src/services/mailer.ts", "README.md", "src/domain/user-service.ts"]) assert.ok(!isSchemaPath(p), p);
  assert.ok(isSchemaPath("src/contracts/user.yaml", ["src/contracts/**"]));
});

test("governance config falls back to defaults on bad input", () => {
  assert.equal(governanceConfig(null).inventoryPath, "docs/compliance/data-inventory.md");
  assert.deepEqual(governanceConfig({ governance: { schemaPaths: ["a/**", 3], piiTerms: "x" } }), {
    schemaPaths: ["a/**"],
    piiTerms: [],
    inventoryPath: "docs/compliance/data-inventory.md",
  });
});
