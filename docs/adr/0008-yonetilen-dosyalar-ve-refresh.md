# ADR-0008: Setup'ın kurduğu CI dosyaları için yönetilen dosyalar ve `--refresh`

- **Durum:** Kabul edildi
- **Tarih:** 2026-11-23
- **Genişlettiği karar:** [ADR-0006](0006-stack-sozlesmesi.md) madde 5 (yönetilen kurallar)

## Bağlam

Plugin'lerin `setup` skill'leri projeye CI script'leri ve workflow'lar kuruyor:

- governance: `security.yml`, `compliance.yml`, `change-audit.yml`, `change-audit.mjs`, `compliance-gate.mjs`
- stack-web: `bundle-budget.mjs`
- data-sql: `migration-check.mjs`
- design: `token-lint.mjs`

Setup bugüne kadar add-only çalıştı: var olan dosyanın üzerine hiç yazmadı. Bu güvenli, ama plugin'deki bir düzeltme kurulu projeye hiç ulaşmıyor. Örnek uygulamada bu somut olarak görüldü: governance 0.1.3, `change-audit`'in yanlış pozitif bir `[change-control]` issue'su açmasına yol açan hatayı düzeltti. Ancak örnek repodaki `change-audit.mjs` hâlâ hatalı 0.1.2 kopyası. Aynı durum `migration-check.mjs` için de geçerli (data-sql 0.1.1 düzeltmesi).

Kural dosyaları için bir çözüm zaten var ([ADR-0006](0006-stack-sozlesmesi.md) madde 5): dosya `Managed by <plugin>` işareti taşıyor ve `--refresh` yalnız işaretli dosyaları güncelliyor. Ama bu, elle yapılmış bir değişikliği de ezer. CI script'leri projede yerel bir düzeltme taşıyabilir.

## Karar

1. **Yönetilen yollar:** `.github/scripts/` ve `.github/workflows/` altındaki şablonlar. Kayıtlar (`docs/`), `dependabot.yml` (stack plugin'leri de ekleme yapar) ve issue şablonları projenin dosyasıdır; setup onlara hiç yazmaz.
2. **İşaret:** Yönetilen dosyanın ilk satırı (shebang varsa ikinci satırı) dosyanın yorum sözdizimiyle şunu taşır:
   `Managed by <plugin> <sürüm> (ideal-agentic-env). … sha256:<16 hex>`
   Hash, işaret satırı çıkarılmış içeriğin SHA-256'sının ilk 16 karakteridir. Satır sonları normalize edilir, böylece Windows checkout'u da eşleşir.
3. **`--refresh` kuralı:**

   | Projedeki dosya | Varsayılan | `--refresh` |
   | --- | --- | --- |
   | İşaretli, hash tutuyor, içerik güncel | skip (güncel) | skip |
   | İşaretli, hash tutuyor, içerik eski | skip (eski) | **update** |
   | İşaretli, hash tutmuyor (elle değiştirilmiş) | skip | skip |
   | İşaretsiz, içerik şablonla aynı | skip | update (yalnız işaret eklenir) |
   | İşaretsiz, içerik farklı (eski sürüm ya da proje dosyası) | skip | skip |
   | Başka bir plugin'in işareti | skip | skip |

4. **`--adopt <yol,…>`:** Kanıtlanamayan iki durum (elle değiştirilmiş ya da işaretsiz farklı dosya) yalnız kullanıcı açıkça kabul ederse değiştirilir. Skill önce `--print <yol>` ile yazılacak içeriği gösterir ve kullanıcıya sorar.
5. **Projenin kararları yönetilen dosyada durmaz.** Örneğin lisans allowlist'i ve güvenlik eşiği `security.yml`'den `.claude/ideal-agentic-env.json` dosyasına taşındı ([ADR-0009](0009-bagimlilik-kapisi-onem-politikasi.md)). Setup eski değeri olduğu gibi taşır. Böylece bir refresh hukuki ya da güvenlik kararını ezmez.
6. Mekanizma ortak koddur (`shared/scaffold-lib.mjs`) ve bütün setup script'lerinde aynı davranır.

## Sonuçlar

**Olumlu**

- Plugin düzeltmeleri kurulu projelere tek komutla ulaşır: `/<plugin>:setup --refresh`. Değişiklik yine dry run, kullanıcı onayı ve PR ile gelir.
- Elle yapılmış bir değişiklik asla sessizce ezilmez.
- 0.1.x'ten kalan işaretsiz kopyalar tanınır ve kullanıcı onayıyla güncellenebilir.

**Olumsuz ve riskler**

- Elle değiştirilmiş bir dosya o noktadan sonra güncelleme almaz. Kullanıcı ya değişikliği plugin'e taşır (tercih edilen yol), ya da `--print` ile birleştirip `--adopt` kullanır.
- Hash yalnız değişikliği tespit eder, güvenlik kontrolü değildir. Dosyayı değiştirip hash'i de güncelleyen biri setup'ı yanıltabilir. Bu dosyalar zaten korumalı yollarda (`.github/`) ve PR incelemesinden geçiyor.
- core'un `scripts/verify.mjs`, `.githooks/pre-push` ve `ci.yml` dosyaları bu kararın kapsamında değil. `ci.yml`'e stack katkısı ayrı bir mekanizmayla gelir ([ADR-0010](0010-stack-sozlesmesi-v2.md)).

## Değerlendirilen alternatifler

- **Add-only'de kalmak, değişiklikleri CHANGELOG'da duyurmak:** Bugünkü durum. Örnek repoda düzeltmelerin ulaşmadığı görüldü.
- **Her refresh'te üzerine yazmak (ADR-0006'daki kural modeli):** Basit, ama CI script'lerindeki yerel düzeltmeleri sessizce ezer.
- **Hash'leri ayrı bir kilit dosyasında tutmak:** Dosya taşınınca ya da silinince kilit dosyası eskir. İşaret dosyanın içinde olunca dosyayla birlikte hareket eder.
- **Eski sürümlerin hash'lerini plugin'de taşıyıp işaretsiz kopyaları otomatik güncellemek:** Şablonlar projeye göre render edildiği için (ör. default branch) eski hash'ler projeden projeye değişir. Açık `--adopt` daha şeffaf.

## Bağlantılar

- [ADR-0006](0006-stack-sozlesmesi.md), [ADR-0009](0009-bagimlilik-kapisi-onem-politikasi.md), `shared/scaffold-lib.mjs`, `scripts/scaffold-lib.test.mjs`
