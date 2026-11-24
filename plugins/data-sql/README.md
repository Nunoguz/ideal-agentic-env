# data-sql

> **Durum:** Stabil, 1.0.0.

İlişkisel veritabanı disiplini: güvenli migration, index ve sorgu incelemesi, row-level security. PostgreSQL öncelikli; MySQL ve SQL Server için ortak kurallar.

## Ne yapar?

- **Yasa katmanı: `migration-check`.** `/data-sql:setup`, `.github/scripts/migration-check.mjs`'i kurar ve `verify.fast`'e ekler. Böylece Claude'un Stop hook'u, geliştiricinin terminali ve CI aynı kontrolü çalıştırır:
  - **Değişmezlik:** base branch'te bulunan bir migration değiştirilir, yeniden adlandırılır ya da silinirse kırmızı. Bu kural önceden yalnız core'un hook'unda vardı; artık CI'da da var.
  - **Lint:** yeni migration'larda uzun kilit ve sessiz veri kaybı. `CONCURRENTLY`'siz index, `NOT VALID`'siz constraint, default'suz `NOT NULL` kolon, yerinde tip değişikliği, `DROP`/`RENAME`, `TRUNCATE` ya da `WHERE`'siz `DELETE`/`UPDATE`.
  - Gerçekten güvenli bir bulgu dosyada gerekçeyle kabul edilir: `-- migration-check: allow <kural> <gerekçe>`.
- **Kurallar (path-scoped):** SQL, migration, PostgreSQL, SQL Server, Drizzle, Prisma, EF Core ve Flyway. Yalnız SQL, migration ve şema dosyalarına (EF Core'da `DbContext`, configuration ve repository dosyalarına) dokunulunca yüklenir.
- **EF Core:** `migration-check`, EF Core migration'larını (`Migrations/*.cs`, `Designer.cs` ve `ModelSnapshot` hariç) `MigrationBuilder` çağrıları üzerinden SQL kurallarıyla aynı kimliklerle denetler: `DropColumn`/`RenameColumn`, `AlterColumn` tip değişikliği, eşzamanlı olmayan `CreateIndex` (Npgsql `IsCreatedConcurrently()`), var olan tabloya foreign key ve `migrationBuilder.Sql("...")` içindeki SQL. Yalnız `Up()` okunur. Kabul: `// migration-check: allow <kural> <gerekçe>`.
- **SQL Server:** `sqlserver.md` kuralı ve `ONLINE = ON` olmadan kurulan index için uyarı (Standard sürümde bu seçenek yok, bu yüzden hata değil).
- **CI:** Projede PostgreSQL ya da SQL Server sürücüsü varsa `ci.yml`'e digest'e pinli bir job service'i eklenir ([ADR-0010](../../docs/adr/0010-stack-sozlesmesi-v2.md)). SQL Server'ın `sa` parolası koşu kimliğinden türetilir; dosyaya parola yazılmaz. SQL Server imajı Developer sürümüdür ve lisansı geliştirme ve test için ücretsizdir.
- **SQL Server ve lisans kapısı:** `Microsoft.Data.SqlClient`'ın native paketleri (`Microsoft.Data.SqlClient.SNI.runtime`, `Microsoft.Identity.Client.NativeInterop`) OSV-Scanner'da SPDX dışı ("non-standard") lisansla görünür ve governance'ın lisans kapısında durur (fixture CI'ında görüldü). Bunlar Microsoft'un dağıttığı native bileşenler. Bunlar varsayılan allowlist'e **eklenmedi** (repo sahibinin kararı, 2026-11-24). SQL Server kullanan her proje bunu kendisi kabul eder: o projenin sahibi onaylarsa `osv-scanner.toml`'a gerekçesi ve bitiş tarihi olan bir girdi yazılır, incelenen bir PR'da. Açık taraması devam eder:

  ```toml
  [[PackageOverrides]]
  name = "Microsoft.Data.SqlClient.SNI.runtime"
  ecosystem = "NuGet"
  license.ignore = true
  effectiveUntil = 2027-06-30
  reason = "Microsoft's native SQL Server client component (non-SPDX license), shipped with Microsoft.Data.SqlClient. Accepted by <owner> on <date>. Vulnerability scanning still applies."
  ```

  `Microsoft.Identity.Client.NativeInterop` için aynı girdi tekrarlanır.
- **Config:** algılanan ORM'in migration klasörü `migrations` listesine eklenir; core'un edit ve shell guard'ları da onu korur. Veritabanı türü `dataSql.dialect`'e yazılır.

## Skill'ler ve agent

| Bileşen | Nasıl çağrılır | Ne yapar |
| --- | --- | --- |
| `setup` | `/data-sql:setup` | Sözleşmeyi (`stack.json`) projeye add-only uygular. |
| `migration` | Otomatik | Expand/contract, kilitsiz DDL, batch backfill. |
| `query-review` | Otomatik | Sorgu planı, index, N+1 ve sayfalama incelemesi. |
| `rls` | Otomatik | PostgreSQL row-level security ve tenant izolasyonu, testleriyle. |
| `db-reviewer` | Agent | Migration ve veri erişim kodunu salt okunur inceler. |

## Kurulum

Önce `/core:init` çalışmış olmalı.

```bash
claude plugin install data-sql@ideal-agentic-env --scope project
```

Sonra Claude Code içinde `/data-sql:setup`. Kararların gerekçesi: [ADR-0007](../../docs/adr/0007-migration-guvenligi.md).
