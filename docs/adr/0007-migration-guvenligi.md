# ADR-0007: Migration güvenliği: değişmezlik CI'da, lint kendi kural setimizle

- **Durum:** Kabul edildi
- **Tarih:** 2026-11-23

## Bağlam

Anayasanın 12. maddesi ve core'un edit-guard'ı şunu söylüyor: "Merge edilmiş migration değiştirilmez." Ama bu kural yalnız **Kural** katmanındaydı. Claude'u durduruyordu, insanı ve başka araçları durdurmuyordu. CLAUDE.md'nin katman kuralına göre "asla olmamalı" denen her şey CI'da da zorlanmalı.

İkinci risk, merge edilmemiş ama tehlikeli migration'lar. Bunlar sessizce kesinti ya da veri kaybı üretir:

- `CONCURRENTLY` olmadan index kurmak,
- `NOT VALID` olmadan constraint eklemek,
- default değeri olmadan `NOT NULL` kolon eklemek,
- kolonun tipini yerinde değiştirmek,
- `DROP` ya da `RENAME` ile çalışan kodu kırmak.

Planda Postgres için **squawk** önerilmişti. squawk, SQL'i gerçek bir parser'la okuyan, Apache-2.0 lisanslı bir linter.

## Karar

1. **Değişmezlik ve lint tek bir script'te.** data-sql:setup, `migration-check.mjs` adlı, bağımlılığı olmayan bir Node script'ini projeye `.github/scripts/` altına kurar. `.github/**` korumalı bir yol olduğu için script CODEOWNERS'ın sahipliğindedir. Setup aynı script'i `verify.fast` adımlarına da ekler. Böylece Claude'un Stop hook'u, geliştiricinin terminali ve CI aynı kontrolü çalıştırır (PLAN §2: tek doğrulama komutu).
2. **Değişmezlik kuralı.**
   - Base branch'te bulunan ve `migrations` glob'larına uyan bir dosya değiştirilir, yeniden adlandırılır ya da silinirse kontrol kırmızıya döner.
   - Base şöyle belirlenir: PR'da `origin/$GITHUB_BASE_REF`, yerelde varsayılan branch ile merge base. `main`'e push'ta kontrol atlanır; o commit'in PR'ı kontrolü zaten çalıştırmıştır, `main`'e PR'sız gelen commit'leri de change-audit yakalar.
   - Kendi aracının güncellediği dosyalar istisnadır (`migrationsMutable`): Drizzle'ın `meta/_journal.json` dosyası, Prisma'nın `migration_lock.toml` dosyası, EF Core'un `*ModelSnapshot.cs` dosyası ve Flyway'in tekrarlanabilir `R__*.sql` migration'ları. Aynı liste core'un edit-guard'ına da eklendi; bir test iki listenin aynı kaldığını doğrular.
3. **Lint için kendi küçük kural setimiz.** Yalnız base'den bu yana eklenen ya da değişen migration'lar denetlenir, eski migration'lar kırmızı üretmez.

   | Kural | Lehçe |
   | --- | --- |
   | `index-concurrently` | PostgreSQL |
   | `add-column-not-null` | hepsi |
   | `set-not-null` | PostgreSQL |
   | `alter-column-type` | hepsi |
   | `constraint-not-valid` | PostgreSQL |
   | `drop-or-rename` | hepsi |
   | `destructive-dml` | hepsi |

   - Aynı dosyada yaratılan bir tabloya yapılan işlemler bulgu üretmez. Drizzle'ın ürettiği yeni tablo SQL'i bu yüzden temiz geçer.
   - Gerçekten güvenli bir bulgu, dosyada gerekçeyle kabul edilir: `-- migration-check: allow <kural> <gerekçe>`. Gerekçe PR'da görünür.
   - `lock_timeout` eksikliği yalnız uyarıdır.
4. **squawk şimdilik alınmadı.** Gerekçesi:
   - Kontrolün yerelde ve CI'da **aynı komutla** çalışması bir ilke. squawk bunu ancak her geliştirici makinesine bir binary indirerek sağlar. Seçenekler sha256 ile doğrulanan bir indirme ya da npm paketinin postinstall indirmesi; ikisi de makinelere ek bir tedarik zinciri adımı getirir.
   - Yalnız CI'da çalıştırmak ayrı bir workflow ve dakika maliyeti demek. Kurallar da yerel verify'dan farklılaşır.
   - Bizim bulmak istediğimiz kalıplar sınırlı ve iyi tanımlı. Bağımlılıksız, test edilmiş bir kural seti bunları yakalıyor.

## Sonuçlar

**Olumlu**

- "Merge edilmiş migration değişmez" artık Yasa katmanında da var.
- Ek bir binary, workflow ya da Actions dakikası gerekmiyor.
- Kurallar bizim sahipliğimizde ve testli. MySQL ve SQL Server'da da çalışıyor; yalnız PostgreSQL'e özgü kurallar kapanıyor.

**Olumsuz ve riskler**

- Regex tabanlı kural, gerçek bir parser kadar isabetli değil. Dinamik SQL, `DO $$ ... $$` blokları ve alışılmadık yazımlar kaçabilir. Bu bir güvenlik ağıdır; `db-reviewer` agent'ı ve insan incelemesi devam eder.
- Kontrol base branch'i bulamazsa (ilk commit, sığ bir klon) kendini atlar ve bunu söyler. CI'da base'i kendisi fetch eder.
- `CONCURRENTLY` transaction içinde çalışmaz. Migration'ları transaction içinde çalıştıran araçlarda (ör. Drizzle'ın migrator'ı) bu bulgu ya ayrı ve transaction dışı bir adımla ya da gerekçeli bir `allow` ile çözülür.

## Değerlendirilen alternatifler

- **squawk, CI'da ve sabitlenmiş binary ile:** Faz 5'te yeniden değerlendirilecek. Ek bir CI job'ı olarak, `paths` filtresiyle yalnız migration değiştiğinde çalışabilir.
- **Yalnız core hook'u:** Claude dışındaki her yolu (insan, IDE, başka bir araç) açık bırakır.

## Ek: EF Core migration'ları (2026-11-23, Faz 4)

EF Core migration'ları SQL değil, C# dosyası (`Migrations/<zaman>_<ad>.cs`). Aynı kuralları EF Core için iki yoldan uygulayabilirdik:

1. `dotnet ef migrations script` ile SQL üretip mevcut kurallardan geçirmek. Bu, `dotnet-ef` aracı, bir build ve veritabanı sağlayıcısı ister; `verify --fast` için ağır ve yerelde de CI'da da ek kurulum demek.
2. C# dosyasını `MigrationBuilder` çağrıları üzerinden okumak.

**Karar:** İkinci yol. `migration-check`, `Up()` gövdesindeki `migrationBuilder.<İşlem>(...)` çağrılarını parantez dengesiyle ayrıştırır. Kural kimlikleri SQL'dekiyle aynı: `drop-or-rename`, `add-column-not-null`, `alter-column-type`, `set-not-null`, `index-concurrently`, `constraint-not-valid`. `migrationBuilder.Sql("...")` içindeki metin SQL kurallarından geçer. Aynı migration'da yaratılan tabloya yapılan işlemler, SQL'de olduğu gibi muaf. `Down()` okunmaz, çünkü `Up()`'ı geri alır. `*.Designer.cs` ve `*ModelSnapshot.cs` araç tarafından üretilir.

SQL Server'da `ONLINE = ON` olmadan kurulan index **uyarıdır**, hata değil: bu seçenek yalnız Enterprise sürümünde ve Azure SQL'de var.

Sınırlar: interpolasyonlu (`$"..."`) SQL okunmaz; ORM'in ürettiği SQL'in kendisi denetlenmez. Bu yüzden `efcore.md` kuralı, `dotnet ef migrations script --idempotent` çıktısının PR'da gözden geçirilmesini istiyor.

## Bağlantılar

- [ADR-0003](0003-free-planda-yasa-katmani.md), [ADR-0006](0006-stack-sozlesmesi.md), `plugins/data-sql/skills/setup/templates/.github/scripts/migration-check.mjs.tmpl`
