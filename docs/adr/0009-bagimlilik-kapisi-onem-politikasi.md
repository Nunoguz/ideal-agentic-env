# ADR-0009: Bağımlılık kapısında önem derecesi politikası

- **Durum:** Kabul edildi (repo sahibinin kararı, 2026-11-23)
- **Tarih:** 2026-11-23
- **Değiştirdiği karar:** [ADR-0004](0004-ci-guvenlik-araclari.md), bağımlılık açığı ve lisans satırları

## Bağlam

[ADR-0004](0004-ci-guvenlik-araclari.md)'te OSV-Scanner bulduğu her açıkta job'ı kırmızıya çeviriyordu, önem derecesine bakmadan. Örnek uygulamada iki orta seviye açık PR'ı durdurdu: minimatch (CVSS 6.9) ve esbuild (CVSS 5.3). İkisi de yalnız geliştirme araçlarındaydı ve üretime çıkmıyordu. Akış ancak bitiş tarihli istisnalarla devam edebildi. Repo sahibinin geri bildirimi: güvenlik kapısı bize gereksiz kesinti yaşatmasın.

İkinci bir sorun daha çıktı: monorepo'daki workspace paketleri (`@iae/api` gibi) lisans alanı taşımadığı için `UNKNOWN` göründü ve lisans kapısını durdurdu. Bunlar bağımlılık değil, reponun kendi kodu.

Gerçek OSV-Scanner 2.7.1 çıktısında (JSON) şunlar var:

- her açık grubu için `max_severity`, yani CVSS taban puanı (v3 ya da v4),
- npm lockfile'ında dev bağımlılıkları için `dependency_groups: ["dev"]`,
- workspace paketleri için `purl` içinde `source=LOCAL`.

Dev ve üretim ayrımı yalnız npm lockfile'ında güvenilir. NuGet (`packages.lock.json`), Swift ve Gradle lockfile'larında böyle bir işaret yok.

## Karar

Repo sahibi 2026-11-23'te üç seçenek arasından şunu seçti: **önem eşiği her yerde aynı.**

1. **Kırmızı (PR'ı durdurur):**
   - CVSS taban puanı **7.0 ve üstü** (High, Critical). Bağımlılığın dev ya da üretim olması fark etmez.
   - **Kötü niyetli paket** (`MAL-*` kaydı), puana bakılmaz.
   - **Önemi yayımlanmamış** bulgu: ne CVSS puanı ne de advisory'de bir önem metni var. Bilinmeyen risk kırmızıdır (fail closed).
   - **Allowlist dışı lisans** (bugünkü davranış).
   - OSV-Scanner'ın hata kodu (ör. ağ hatası). Tarama yapılamadıysa kapı geçmez.
2. **Yalnız rapor (akışı kesmez):** 7.0'ın altındaki açıklar. CVSS puanı yoksa advisory'deki metne bakılır: MODERATE ve LOW rapora, HIGH ve CRITICAL kırmızıya düşer.
   - Job özetinde, dev ya da runtime olduğu da yazılarak listelenir.
   - Haftalık zamanlanmış çalışma tek bir `[vulnerability-report]` issue'sunu açık tutar ve günceller; bulgu kalmayınca kapatır. Bu, SOC 2 ve ISO 27001 için açık yönetiminin kanıtıdır. `issues: write` yetkisini yalnız bu job alır.
3. **Birinci taraf paketler** lisans kontrolünden çıkar. Koşul: OSV-Scanner paketi `LOCAL` işaretliyor **ve** repodaki bir `package.json` bu adı tanımlıyor. İkinci koşul, `file:` ile eklenmiş üçüncü taraf bir paketin kontrolden kaçmasını önler. `osv-scanner.toml`'a bunun için istisna yazılmaz.
4. **Politika projede durur:** `.claude/ideal-agentic-env.json` → `governance.vulnerabilities.blockAtOrAbove` (varsayılan 7) ve `governance.licenses.allow`. Eksik ya da bozuk politika kapıyı kırmızıya çevirir. Eşiği düşürmek ya da yükseltmek, allowlist'i değiştirmek ve istisna eklemek repo sahibinin kararıdır ve PR ile yapılır.
5. **İstisnalar** değişmedi: kırmızı bir bulgu düzeltilemiyorsa `osv-scanner.toml`'a `reason` ve bitiş tarihiyle yazılır (`[[IgnoredVulns]]` için `ignoreUntil`, `[[PackageOverrides]]` için `effectiveUntil`).
6. Uygulama tek bir yönetilen script'tir: `.github/scripts/dependency-gate.mjs` ([ADR-0008](0008-yonetilen-dosyalar-ve-refresh.md)). OSV-Scanner'ı bir kez çalıştırır (açık ve lisans), JSON'u politikaya göre değerlendirir. Yerelde de aynı komutla çalışır.

## Sonuçlar

**Olumlu**

- Dev araçlarındaki orta seviye açıklar akışı kesmiyor ama kayıtta kalıyor. Örnek repodaki iki istisna bu politikayla gereksizleşiyor; kaldırmak repo sahibinin kararı.
- Kural ekosistemden bağımsız: npm, NuGet ve diğerlerinde aynı eşik geçerli.
- Monorepo'larda birinci taraf paketler için elle istisna yazmak gerekmiyor.

**Olumsuz ve riskler**

- Üretim bağımlılığındaki orta seviye bir açık da PR'ı durdurmuyor. Yalnız raporda ve haftalık issue'da görünür. Bu bilinçli bir risk kabulüdür; issue'yu izlemek gerekir.
- CVSS taban puanı bağlamı bilmez: kullanılmayan bir koddaki 7.5 kırmızıdır, kullanılan koddaki 6.8 değildir. İstisna ve eşik ayarı bu yüzden var.
- Önemi yayımlanmamış kayıtlar (bazı PYSEC ve GO kayıtları gibi) kırmızıdır ve inceleme ister.

## Değerlendirilen alternatifler

- **Üretim odaklı (yalnız üretim bağımlılığında High/Critical kırmızı):** En az kesinti. Ama npm dışında dev ve üretim ayrımı yok, yani .NET'te pratikte bu karara döner. Dev araçlarındaki High açıkları (ör. derleme zincirinde) da görmezden gelirdi.
- **Katı (üretimde her önem kırmızı, dev'de High/Critical kırmızı):** Bugünkü kesinti üretim bağımlılıklarında sürerdi.
- **`osv-scanner.toml`'a setup'ın birinci taraf istisnası yazması (Faz 3'te önerilen):** Workspace değişince istisna dosyası eskir ve her yeni paket elle eklenirdi. `LOCAL` işaretini kullanan otomatik kural bakım istemiyor.

## Ek: varsayılan allowlist (2026-11-23)

Örnek .NET + Vue reposunda lisans kapısı iki izin verici lisansı durdurdu: `MIT-0` (`@csstools/*`, jsdom üzerinden) ve `PostgreSQL` (Npgsql, her .NET + PostgreSQL projesinde çıkar). Repo sahibi ikisini governance'ın varsayılan allowlist'ine eklemeyi seçti. Paket bazlı istisna ve yalnız o repoya ekleme seçeneklerine karşı tercih edildi.

## Ek: güvenlik yamaları ve cooldown (2026-11-23)

Container kapısı, örnek repoda ASP.NET Core runtime 10.0.14'teki üç High açıkta kırmızıya döndü. Düzeltme 10.0.15'teydi, ama sürüm 13 günlüktü ve 14 günlük cooldown ([ADR-0004](0004-ci-guvenlik-araclari.md) madde 3) onu almayı engelliyordu. İki kural birbirini kilitliyordu.

**Karar (repo sahibi):** Aynı sürüm hattındaki (ör. 10.0.14 → 10.0.15, 1.30.6 → 1.30.7) resmî yayıncı yaması, kırmızı bir bulguyu düzeltiyorsa cooldown beklenmeden alınır. PR açıklamasına hangi bulguyu düzelttiği yazılır. Yeni minor ve major sürümler ile yeni paketler için 14 gün geçerli kalır. Alternatif, yama 14 günü doldurana kadar bitiş tarihli bir istisnaydı.

## Bağlantılar

- [ADR-0004](0004-ci-guvenlik-araclari.md), [ADR-0008](0008-yonetilen-dosyalar-ve-refresh.md), `plugins/governance/skills/setup/templates/.github/scripts/dependency-gate.mjs.tmpl`
