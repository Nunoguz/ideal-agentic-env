# ADR-0004: CI güvenlik taraması için sabitlenmiş açık kaynak CLI araçları

- **Durum:** Kabul edildi. Bağımlılık açığı ve lisans satırları [ADR-0009](0009-bagimlilik-kapisi-onem-politikasi.md) ile değişti.
- **Tarih:** 2026-11-23

## Bağlam

[PLAN.md §4.2](../PLAN.md) governance için altı CI kontrolü istiyor:

- secret tarama
- SAST
- bağımlılık açıkları
- lisans kontrolü
- SBOM
- container tarama

Free planda private repolarda CodeQL, `dependency-review-action` ve secret scanning push protection kullanılamıyor ([ADR-0003](0003-free-planda-yasa-katmani.md)). Bu yüzden araçlar runner üzerinde çalışmalı ve bulgu olduğunda job'ı kırmızıya çevirmeli. SARIF yüklemeye güvenemeyiz.

Kabul politikası (CLAUDE.md) gereği üçüncü taraf her aracı inceliyoruz, sürümünü sabitliyoruz ve gerekçesini kaydediyoruz. Tedarik zinciri saldırılarında genellikle değiştirilebilir tag'ler ve doğrulanmadan indirilen binary'ler kullanılıyor.

## Karar

`governance` plugin'inin `security.yml` şablonu tek bir ubuntu job'ında şu araçları çalıştırır:

| İhtiyaç | Araç | Lisans | Neden |
| --- | --- | --- | --- |
| Secret | **gitleaks** 8.30.1 | MIT | Git geçmişini tarar. PR'da yalnız PR'ın commit aralığını tarar. |
| SAST | **Semgrep CE** 1.184.0 (`p/default`, `--metrics=off`) | LGPL-2.1 (motor) | Çok dilli. PR'da `--baseline-commit` ile yalnız yeni bulgular kırmızıya çevirir. |
| Bağımlılık açığı | **OSV-Scanner** 2.7.1 | Apache-2.0 | Bütün ekosistemlerin lockfile'larını okur. İstisnalar gerekçe ve bitiş tarihiyle `osv-scanner.toml`'a yazılır. |
| Lisans | **OSV-Scanner** `--licenses=<allowlist>` | Apache-2.0 | Ayrı bir araca gerek kalmaz. İzinli lisans listesi workflow'da, hukuki bir karar olarak tutulur. |
| SBOM | **Syft** 1.57.0 (SPDX JSON, artifact) | Apache-2.0 | Standart çıktı üretir. Yalnız `main` ve zamanlanmış çalışmalarda üretilir. |

Sabitleme kuralları:

1. Binary'ler **sürüm ve sha256** ile sabitlenir. Checksum resmî release'in checksum dosyasından alınır ve workflow'a yazılır, böylece indirilen dosya her çalışmada doğrulanır. Semgrep PyPI'dan tam sürümle (`==`) kurulur. PyPI'da bir sürüm sonradan değiştirilemez.
2. GitHub Actions `uses:` satırları tam commit SHA'sına pinlenir, sürüm yorum olarak yazılır (`@<sha> # v5.1.0`). `npm run validate` pinlenmemiş bir action'ı hata sayar.
3. Yeni sürüm en az **14 gün** bekletilir (cooldown). Bu süre, kötü niyetli bir sürümün fark edilip geri çekilmesi için zaman tanır. Dependabot (`github-actions`, `cooldown: 14 gün`) action sürümlerini günceller. Binary sürümlerini ise governance release'leri günceller.
4. Ağ çağrıları ve dışarı giden veriler:
   - OSV-Scanner `osv.dev` ve `deps.dev`'e yalnız paket adı ve sürümü gönderir.
   - Semgrep kuralları `semgrep.dev`'den indirir, metrik göndermez.
   - Kişisel veri veya kaynak kod dışarı gönderilmez.

**Container tarama** (trivy veya grype), imaj üretimiyle birlikte `devops-selfhosted` plugin'ine (Faz 4) ertelendi. İmajı oluşturmayan bir plugin'in onu taraması anlamsız.

## Sonuçlar

**Olumlu**

- GHAS lisansı gerekmez.
- Bütün araçlar yerelde de aynı komutla çalışır.
- Bulgu varsa job kırmızıya döner. Bu Yasa katmanıdır.

**Olumsuz ve riskler**

- Sabitlenmiş sürümleri ve checksum'ları bizim güncellememiz gerekir. Bu iş governance CHANGELOG'una girer.
- gitleaks'in README'si projenin "feature complete" olduğunu ve artık yalnız güvenlik yamaları çıkacağını söylüyor. Faz 5'te bir halef araç değerlendirilecek.
- OSV-Scanner'ın lisans taramasında UNKNOWN lisanslar yanlış pozitif üretebilir. Bu durumda `osv-scanner.toml` içinde `[[PackageOverrides]]` ile gerekçeli bir override yazılır.
- Semgrep `p/default` ilk kurulumda mevcut koddaki bulguları gösterir. Projeye eklerken önce bu bulgular triage edilir: düzeltilir ya da gerekçeli bir `nosemgrep` ile işaretlenir.

## Değerlendirilen alternatifler

- **CodeQL, dependency-review ve GHAS:** Free planda private repoda yok.
- **Her şeyi Trivy ile yapmak:** Tek bir binary ile iş görür, ama Trivy secret taramasında git geçmişine bakmaz ve SAST yapmaz.
- **Marketplace action'ları (`*-action@vX`):** Tag'ler değiştirilebilir. Bazı action'lar (ör. gitleaks-action) organizasyon hesaplarında lisans istiyor. Doğrulanmış binary daha şeffaf.

## Bağlantılar

- [ADR-0003](0003-free-planda-yasa-katmani.md), `plugins/governance/skills/setup/templates/.github/workflows/security.yml.tmpl`
