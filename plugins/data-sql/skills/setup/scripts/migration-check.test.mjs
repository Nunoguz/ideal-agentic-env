// Tests for the migration-check script data-sql:setup installs. The template is rendered exactly as setup
// renders it, written to a temp .mjs and imported, so the shipped file is what is tested.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULTS as CORE_DEFAULTS } from "../../../../core/hooks/lib/config.mjs";
import { loadPlugin, PLUGIN_ROOT } from "./setup.mjs";
import { buildStackPlan } from "./stack-lib.mjs";

const { plugin, contract } = loadPlugin();
const empty = mkdtempSync(join(tmpdir(), "iae-sql-empty-"));
writeFileSync(join(empty, "package.json"), JSON.stringify({ dependencies: { pg: "8.16.3" } }));
const script = buildStackPlan(PLUGIN_ROOT, plugin, contract, empty).actions.find((a) => a.rel === ".github/scripts/migration-check.mjs");
const OUT = join(mkdtempSync(join(tmpdir(), "iae-sql-check-")), "migration-check.mjs");
writeFileSync(OUT, script.content);
const mc = await import(pathToFileURL(OUT).href);

const GIT_ID = ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false"];
function git(cwd, ...args) {
  const r = spawnSync("git", [...GIT_ID, ...args], { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
}
function put(root, rel, content) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), content);
}
/** main with `files` committed, then a feature branch. */
function repo(files) {
  const root = mkdtempSync(join(tmpdir(), "iae-mig-"));
  git(root, "init", "-q", "-b", "main");
  for (const [rel, content] of Object.entries(files)) put(root, rel, content);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "base");
  git(root, "switch", "-q", "-c", "feat/x");
  return root;
}
const LOCAL = { GITHUB_ACTIONS: "", GITHUB_BASE_REF: "" };

test("defaults match core's, so the hook and CI protect the same files", () => {
  assert.deepEqual(mc.DEFAULT_MIGRATIONS, CORE_DEFAULTS.migrations);
  assert.deepEqual(mc.DEFAULT_MUTABLE, CORE_DEFAULTS.migrationsMutable);
});

test("a modified, deleted or renamed merged migration fails; a new one passes", () => {
  const root = repo({
    "db/migrations/0001_init.sql": "create table t (id int primary key);\n",
    "db/migrations/0002_more.sql": "create table u (id int primary key);\n",
    "db/migrations/0003_x.sql": "create table v (id int primary key);\n",
    "drizzle/meta/_journal.json": "{}\n",
  });
  put(root, "db/migrations/0001_init.sql", "create table t (id bigint primary key);\n");
  rmSync(join(root, "db/migrations/0002_more.sql"));
  git(root, "mv", "db/migrations/0003_x.sql", "db/migrations/0003_y.sql");
  put(root, "db/migrations/0004_add.sql", "create table w (id int primary key);\n");
  put(root, "drizzle/meta/_journal.json", '{"entries":[1]}\n');
  const r = mc.run(root, { env: LOCAL });
  assert.equal(r.code, 1);
  const text = r.lines.join("\n");
  assert.match(text, /0001_init\.sql: merged migration modified/);
  assert.match(text, /0002_more\.sql: merged migration deleted/);
  assert.match(text, /0003_x\.sql: merged migration renamed to db\/migrations\/0003_y\.sql/);
  assert.ok(!/0004_add/.test(text.split("\n").filter((l) => l.startsWith("error")).join("\n")));
  assert.ok(!/_journal/.test(text), "tool-managed files are mutable");
});

test("a clean branch passes and a push to the default branch in CI is skipped", () => {
  const root = repo({ "db/migrations/0001_init.sql": "create table t (id int);\n" });
  put(root, "db/migrations/0002_add.sql", "set lock_timeout = '5s';\nalter table t add column name text;\n");
  assert.equal(mc.run(root, { env: LOCAL }).code, 0);
  const pushed = mc.run(root, { env: { GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "push" } });
  assert.equal(pushed.code, 0);
  assert.match(pushed.lines[0], /skipped/);
});

test("lint findings fail the check; an allow annotation with a reason accepts one rule for that file", () => {
  const root = repo({ "db/migrations/0001_init.sql": "create table loans (id int);\n" });
  put(root, "db/migrations/0002_idx.sql", "create index loans_due on loans (due_at);\n");
  const r = mc.run(root, { env: LOCAL });
  assert.equal(r.code, 1);
  assert.match(r.lines.join("\n"), /\[index-concurrently\]/);
  put(root, "db/migrations/0002_idx.sql", "-- migration-check: allow index-concurrently loans has under 1k rows in every environment\ncreate index loans_due on loans (due_at);\n");
  assert.equal(mc.run(root, { env: LOCAL }).code, 0);
});

const lint = (sql, dialect) => mc.lintSql(sql, dialect).findings.map((f) => f.rule);

test("lint: lock-taking and destructive statements on existing tables are found", () => {
  assert.deepEqual(lint("CREATE INDEX i ON loans (a);"), ["index-concurrently"]);
  assert.deepEqual(lint("create unique index concurrently i on loans (a);"), []);
  assert.deepEqual(lint("drop index i;"), ["index-concurrently"]);
  assert.deepEqual(lint('ALTER TABLE "loans" ADD COLUMN "due" timestamptz NOT NULL;'), ["add-column-not-null"]);
  assert.deepEqual(lint("alter table loans add column due timestamptz not null default now();"), []);
  assert.deepEqual(lint("alter table loans alter column due set not null;"), ["set-not-null"]);
  assert.deepEqual(lint("alter table loans alter column amount type numeric(12,2);"), ["alter-column-type"]);
  assert.deepEqual(lint("alter table loans add constraint fk foreign key (item_id) references items(id);"), ["constraint-not-valid"]);
  assert.deepEqual(lint("alter table loans add constraint fk foreign key (item_id) references items(id) not valid;"), []);
  assert.deepEqual(lint("alter table loans drop column note;"), ["drop-or-rename"]);
  assert.deepEqual(lint("alter table loans rename column note to remark;"), ["drop-or-rename"]);
  assert.deepEqual(lint("drop table loans;"), ["drop-or-rename"]);
  assert.deepEqual(lint("alter table loans alter column note drop not null;"), []);
  assert.deepEqual(lint("alter table loans drop constraint fk;"), []);
  assert.deepEqual(lint("delete from loans;"), ["destructive-dml"]);
  assert.deepEqual(lint("delete from loans where id = 1;"), []);
  assert.deepEqual(lint("update loans set x = 1;"), ["destructive-dml"]);
  assert.deepEqual(lint("truncate loans;"), ["destructive-dml"]);
});

test("lint: statements on a table created in the same file are allowed (Drizzle's generated shape)", () => {
  const generated = [
    'CREATE TABLE IF NOT EXISTS "items" ("id" uuid PRIMARY KEY NOT NULL, "owner_id" uuid NOT NULL);',
    "--> statement-breakpoint",
    'ALTER TABLE "items" ADD CONSTRAINT "items_owner_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id");',
    "--> statement-breakpoint",
    'CREATE INDEX IF NOT EXISTS "items_owner_idx" ON "items" USING btree ("owner_id");',
  ].join("\n");
  assert.deepEqual(lint(generated), []);
});

test("lint: PostgreSQL-only rules are off for other dialects; lock_timeout is a warning", () => {
  assert.deepEqual(lint("create index i on loans (a);", "mysql"), []);
  assert.deepEqual(lint("alter table loans add column due datetime not null;", "mysql"), ["add-column-not-null"]);
  const { warnings } = mc.lintSql("alter table loans add column x text;");
  assert.match(warnings[0], /lock_timeout/);
  assert.deepEqual(mc.lintSql("set lock_timeout = '5s'; alter table loans add column x text;").warnings, []);
  assert.deepEqual(mc.lintSql('create table "items" (id uuid); alter table "items" add constraint c check (id is not null);').warnings, [], "a table created in the same file needs no lock_timeout");
});

test("data-sql setup writes the dialect, the check script and the verify step", () => {
  const root = mkdtempSync(join(tmpdir(), "iae-sql-setup-"));
  put(root, "package.json", JSON.stringify({ dependencies: { pg: "8.16.3", "drizzle-orm": "0.44.0" } }));
  put(root, ".claude/ideal-agentic-env.json", JSON.stringify({ verify: { fast: [], full: [] }, migrations: [] }));
  const plan = buildStackPlan(PLUGIN_ROOT, plugin, contract, root);
  assert.deepEqual(plan.profiles, ["sql", "postgres", "drizzle"]);
  const cfg = JSON.parse(plan.actions.find((a) => a.rel === ".claude/ideal-agentic-env.json").content);
  assert.deepEqual(cfg.dataSql, { dialect: "postgres" });
  assert.deepEqual(cfg.migrations, ["**/drizzle/**"]);
  assert.deepEqual(cfg.verify.fast, [{ name: "migrations", run: "node .github/scripts/migration-check.mjs" }]);
  assert.ok(plan.actions.some((a) => a.rel === ".github/scripts/migration-check.mjs" && a.action === "create"));
});

test("data-sql setup on an EF Core solution: SQL Server dialect, EF rules and the SQL Server CI service", () => {
  const root = mkdtempSync(join(tmpdir(), "iae-sql-ef-"));
  put(root, "src/Api/Api.csproj", '<Project Sdk="Microsoft.NET.Sdk.Web"><ItemGroup><PackageReference Include="Microsoft.EntityFrameworkCore.SqlServer" /></ItemGroup></Project>');
  put(root, ".claude/ideal-agentic-env.json", JSON.stringify({ verify: { fast: [], full: [] } }));
  const ci = "jobs:\n  verify:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm ci\n      - run: node scripts/verify.mjs --full\n";
  put(root, ".github/workflows/ci.yml", ci);
  const plan = buildStackPlan(PLUGIN_ROOT, plugin, contract, root);
  assert.deepEqual(plan.profiles, ["sql", "sqlserver", "efcore"]);
  const cfg = JSON.parse(plan.actions.find((a) => a.rel === ".claude/ideal-agentic-env.json").content);
  assert.deepEqual(cfg.dataSql, { dialect: "sqlserver" });
  assert.ok(plan.actions.some((a) => a.rel === ".claude/rules/data-sql/efcore.md"));
  const workflow = plan.actions.find((a) => a.rel === ".github/workflows/ci.yml").content;
  assert.match(workflow, /    services:\n      # --- data-sql [\d.]+\n(      #.*\n)*      sqlserver:\n        image: mcr\.microsoft\.com\/mssql\/server:[^@]+@sha256:[0-9a-f]{64}/);
  assert.match(workflow, /MSSQL_SA_PASSWORD: Ci-\$\{\{ github\.run_id \}\}-Pw!/);
  assert.ok(plan.notes.some((n) => /SQL Server runs as a job service/.test(n)));
});

// ---------- EF Core ----------

const efMigration = (up, down = "") => `using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Lending.Api.Migrations
{
    /// <inheritdoc />
    public partial class Change : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
${up}
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
${down}
        }
    }
}
`;
const ef = (up, dialect, down) => mc.lintEf(efMigration(up, down), dialect).findings.map((f) => f.rule);
const DUE = `            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DueAt",
                table: "Loans",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));`;
const INDEX = `            migrationBuilder.CreateIndex(
                name: "IX_Loans_DueAt",
                table: "Loans",
                column: "DueAt")`;

test("ef: only Up() is read; Down() may drop what Up created", () => {
  assert.deepEqual(ef(`${DUE}\n${INDEX};`, "postgres", '            migrationBuilder.DropColumn(name: "DueAt", table: "Loans");'), ["index-concurrently"]);
  assert.deepEqual(ef(`${INDEX}\n                .Annotation("Npgsql:CreatedConcurrently", true);`), []);
});

test("ef: tables created in the same migration are exempt, as in the SQL rules", () => {
  const create = `            migrationBuilder.CreateTable(
                name: "Items",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Items", x => x.Id);
                });
            migrationBuilder.CreateIndex(name: "IX_Items_OwnerId", table: "Items", column: "OwnerId");
            migrationBuilder.AddForeignKey(name: "FK_Items_Users", table: "Items", column: "OwnerId", principalTable: "Users", principalColumn: "Id");`;
  assert.deepEqual(ef(create), []);
});

test("ef: drops, renames, type and nullability changes, constraints and raw SQL are found", () => {
  assert.deepEqual(ef('migrationBuilder.DropColumn(name: "Note", table: "Loans");'), ["drop-or-rename"]);
  assert.deepEqual(ef('migrationBuilder.RenameColumn(name: "Note", table: "Loans", newName: "Remark");'), ["drop-or-rename"]);
  assert.deepEqual(ef('migrationBuilder.DropTable(name: "Loans");'), ["drop-or-rename"]);
  assert.deepEqual(ef('migrationBuilder.AddColumn<string>(name: "Code", table: "Loans", type: "text", nullable: false);'), ["add-column-not-null"]);
  assert.deepEqual(ef('migrationBuilder.AlterColumn<decimal>(name: "Amount", table: "Loans", type: "numeric(12,2)", nullable: false, oldClrType: typeof(int), oldType: "integer");'), ["alter-column-type"]);
  assert.deepEqual(ef('migrationBuilder.AlterColumn<string>(name: "Note", table: "Loans", type: "text", nullable: false, oldClrType: typeof(string), oldType: "text", oldNullable: true);'), ["set-not-null"]);
  assert.deepEqual(ef('migrationBuilder.AddForeignKey(name: "FK_Loans_Items", table: "Loans", column: "ItemId", principalTable: "Items", principalColumn: "Id");'), ["constraint-not-valid"]);
  assert.deepEqual(ef('migrationBuilder.Sql(@"DELETE FROM ""Loans""");'), ["destructive-dml"]);
  assert.deepEqual(ef(`migrationBuilder.Sql("""\n    UPDATE "Loans" SET "Note" = ''\n    """);`), ["destructive-dml"]);
  assert.deepEqual(ef('migrationBuilder.Sql("UPDATE \\"Loans\\" SET \\"Note\\" = \'\' WHERE \\"Id\\" = 1");'), []);
  assert.deepEqual(ef("migrationBuilder.Sql($\"DELETE FROM {table}\");"), [], "interpolated SQL is not read");
});

test("ef: an allow annotation accepts one rule; SQL Server gets a warning for offline index builds, not an error", () => {
  const annotated = `            // migration-check: allow drop-or-rename the Note column was unused since release 1.4 (expand/contract)\n            migrationBuilder.DropColumn(name: "Note", table: "Loans");`;
  assert.deepEqual(ef(annotated), []);
  const r = mc.lintEf(efMigration(`${INDEX};`), "sqlserver");
  assert.deepEqual(r.findings, []);
  assert.match(r.warnings[0], /ONLINE = ON/);
  assert.deepEqual(mc.lintEf(efMigration(`${INDEX}\n                .Annotation("SqlServer:Online", true);`), "sqlserver").warnings, []);
  assert.match(mc.lintSql("create nonclustered index ix on loans (due_at);", "sqlserver").warnings[0], /ONLINE = ON/);
  assert.deepEqual(mc.lintSql("create index ix on loans (due_at) with (online = on);", "sqlserver").warnings, []);
});

test("ef: run() lints new migrations, skips Designer files and the model snapshot, and keeps merged ones immutable", () => {
  const root = repo({ "src/Api/Migrations/20260101_Init.cs": efMigration(""), ".claude/ideal-agentic-env.json": JSON.stringify({ dataSql: { dialect: "postgres" } }) });
  put(root, "src/Api/Migrations/20261120_Due.cs", efMigration(`${DUE}\n${INDEX};`));
  put(root, "src/Api/Migrations/20261120_Due.Designer.cs", 'migrationBuilder.DropTable(name: "x");');
  put(root, "src/Api/Migrations/AppDbContextModelSnapshot.cs", "// changes with every migration");
  const r = mc.run(root, { env: LOCAL });
  const text = r.lines.join("\n");
  assert.equal(r.code, 1);
  assert.match(text, /20261120_Due\.cs: \[index-concurrently\]/);
  assert.ok(!/Designer|ModelSnapshot/.test(text.split("\n").filter((l) => l.startsWith("error")).join("\n")));
  assert.match(text, /\/\/ in C#/);
  put(root, "src/Api/Migrations/20260101_Init.cs", efMigration("// edited"));
  assert.match(mc.run(root, { env: LOCAL }).lines.join("\n"), /20260101_Init\.cs: merged migration modified/);
});
