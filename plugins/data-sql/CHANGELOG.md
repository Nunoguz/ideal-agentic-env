# Changelog — data-sql

## 1.0.0

- Stabil: 1.x içinde kırıcı değişiklik yok; kırıcı her değişiklik major sürüm ve göç notuyla gelir ([ADR-0012](../../docs/adr/0012-v1-surum-sozu.md)). 0.2.0'ın üzerine yalnız bu bölümdeki maddeleri getirir.
- **Flyway:** yeni `flyway` profili ve `flyway.md` kuralı (forward-only, numaralandırma, `clean` yasağı, `ddl-auto=validate`, veritabanı modülü). JVM sürücüleri (`org.postgresql:postgresql`, `mssql-jdbc`, `mysql-connector-j`, MariaDB) ve Spring Boot JDBC/JPA starter'ları `sql`, `postgres`, `sqlserver` ve `mysql` profillerini algılıyor. JVM projesinde CI'a veritabanı servisi eklenmez (testler Testcontainers kullanır); setup bunu, Testcontainers yoksa da eksikliği not olarak söyler.
- README: SQL Server native istemci paketleri varsayılan lisans allowlist'ine girmedi (repo sahibi kararı); proje başına, bitiş tarihli `[[PackageOverrides]]` örneği.
- Ortak setup kütüphanesi (`stack-lib.mjs`) güncellendi: Maven/Gradle manifestleri, `dependencyPrefixes` koşulu, platforma göre verify komutu, koşullu Dependabot girdisi. LSP kontrolü binary'yi artık çalıştırmıyor, PATH'te arıyor. Bu plugin'in davranışı değişmedi.

## 0.2.0

- **EF Core:** yeni `efcore` profili ve `efcore.md` kuralı (migration'ların gözden geçirilmesi ve deploy adımında uygulanması, `EnsureCreated` yasağı, `AsNoTracking`, N+1, `FromSqlRaw` enjeksiyonu, `ExecuteUpdate`/`ExecuteDelete`'in interceptor'ları atlaması, concurrency token'ları). `migration-check` EF Core migration'larını `MigrationBuilder` çağrıları üzerinden denetler ve `Sql("...")` içindeki SQL'i SQL kurallarından geçirir.
- **SQL Server:** `sqlserver` profili artık `sqlserver.md` kuralını kurar ve `Microsoft.EntityFrameworkCore.SqlServer`/`Microsoft.Data.SqlClient` ile de algılanır. `migration-check`, `ONLINE = ON` olmadan kurulan index için uyarı verir. `ci.yml`'e SQL Server 2025 (Developer) job service'i.
- **PostgreSQL:** Npgsql ve `Npgsql.EntityFrameworkCore.PostgreSQL` ile de algılanır.
- `setup`: Kurduğu CI script'leri artık yönetilen dosya ([ADR-0008](../../docs/adr/0008-yonetilen-dosyalar-ve-refresh.md)). `--refresh` onları elle değiştirilmemişlerse günceller; `--print <yol>` yazılacak içeriği gösterir; `--adopt <yol>` işaretsiz ya da elle değiştirilmiş bir kopyayı kullanıcı onayıyla değiştirir.
- `setup`: Kural dosyasında yalnız işaretteki sürüm değiştiyse dosya "outdated" sayılmıyor; `--refresh` gereksiz bir değişiklik üretmiyor.
- Ortak setup kodu stack sözleşmesi v2'ye geçti ([ADR-0010](../../docs/adr/0010-stack-sozlesmesi-v2.md)): `.csproj` manifestleri, `sdk`/`fileContains` koşulları, `{solution}` yer tutucusu ve `ci.yml` blokları.
- `setup`: PostgreSQL sürücüsü (pg, postgres, Npgsql) olan bir projede `ci.yml`'e digest'e pinli bir PostgreSQL job service'i ekler ve bağlantı ayarını not olarak söyler.

## 0.1.1

- Setup, aynı formatter'ı başka bir plugin'in zaten çalıştırdığı dosyalar için tekrar eklemiyor; yalnız kapsanmayan uzantıları ekliyor. Önceden stack-node ve stack-web birlikte kurulunca prettier `.ts` dosyalarında iki kez çalışıyordu (ortak `stack-lib.mjs`).
- `migration-check`: `lock_timeout` uyarısı artık yalnız var olan bir tabloyu değiştiren migration'larda çıkıyor. Önceden Drizzle'ın ürettiği ilk migration'da (aynı dosyada yaratılan tabloya FK ekleme) da çıkıyordu.

## 0.1.0

- `migration-check.mjs` (projeye `.github/scripts/` altında kurulur, `verify.fast` adımı):
  - Merge edilmiş migration'ların değişmezliğini CI'da da zorlar.
  - Yeni migration'larda kilit ve veri kaybı riski için lint yapar. Bulgu yalnız gerekçeli bir `allow` notuyla kabul edilir ([ADR-0007](../../docs/adr/0007-migration-guvenligi.md)).
- `stack.json` profilleri:
  - `sql`, `postgres`, `mysql`, `sqlserver`, `drizzle`, `prisma`.
  - Veritabanı türü `dataSql.dialect`'e yazılır.
  - Drizzle'ın migration klasörü korunan yollara eklenir.
- Kurallar: `sql.md`, `migrations.md`, `postgres.md`, `drizzle.md`, `prisma.md`.
- Skill'ler: `setup`, `migration`, `query-review`, `rls`.
- Agent: `db-reviewer` (salt okunur).

## 0.0.1

- İskelet oluşturuldu (Faz 0).
