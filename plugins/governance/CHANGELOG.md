# Changelog — governance

## 1.0.1

- `change-audit`: merge'den sonra başlayan kontrol koşuları (PR merge edilirken "ready" yapılması ya da düzenlenmesi) artık "merge anında bitmemiş" sayılmıyor. Faz 5 PR'ında yanlış pozitif üretti (#13). Projede `/governance:setup --refresh` ile güncellenir.

## 1.0.0

- Stabil: 1.x içinde kırıcı değişiklik yok; kırıcı her değişiklik major sürüm ve göç notuyla gelir ([ADR-0012](../../docs/adr/0012-v1-surum-sozu.md)). 0.2.0'ın üzerine yalnız bu bölümdeki maddeleri getirir.
- Bağımlılık kapısı (`dependency-gate.mjs`): OSV-Scanner `--all-packages` ile çalışıyor ve rapor kaç paketi hangi kaynaklardan taradığını söylüyor. Tarayıcının hiçbir şey görmediği yeşil bir kapı (desteklenmeyen bir manifest) artık rapordan anlaşılıyor (Java fixture'ında bulundu). Projede `/governance:setup --refresh` ile güncellenir.
- **Maven:** OSV-Scanner, sürümü parent pom'dan ya da BOM'dan gelen bağımlılıkları çözemiyor; her Spring Boot projesinde kapı hiçbir şey taramadan yeşil geçiyordu. Kapı artık en dıştaki her `pom.xml` için Maven'a çözülmüş ağacı CycloneDX SBOM olarak ürettiriyor (`cyclonedx-maven-plugin` 2.9.3, compile ve runtime kapsamı, test hariç) ve onu tarıyor. Ağaç çözülemezse kapı kırmızı (fail closed). Build'in kendi modülleri lisans kontrolünden muaf. OSV-Scanner'ın lisans araması Maven paketleri için boş döndüğünden lisanslar SBOM'dan (paketlerin kendi pom'larından) okunur. Bir pom'da birden çok lisans listelenmişse bunlar seçimdir, biri allowlist'teyse yeter (ikili lisans; repo sahibinin kararı, 2026-11-24). Lisansı olmayan paket UNKNOWN'dır ve kapıyı kırmızıya çevirir. `osv-scanner.toml`'daki `[[PackageOverrides]]` + `license.ignore` istisnaları, `effectiveUntil` tarihine kadar bu paketlere de uygulanır.

## 0.2.0

- Cooldown ve güvenlik yamaları: aynı sürüm hattındaki resmî yama, kırmızı bir bulguyu düzeltiyorsa 14 gün beklenmeden alınabilir (repo sahibinin kararı, ADR-0009 eki).
- Varsayılan lisans allowlist'ine `MIT-0` (CSS araçları) ve `PostgreSQL` (Npgsql) eklendi. İkisi de OSI onaylı, izin verici lisanslar; repo sahibinin 2026-11-23 tarihli kararı. Kurulu projelerin listesi değişmez (add-only); isteyen projeye kendisi ekler.
- Bağımlılık kapısı `governance.dependencyScan.exclude` ile verilen dizinleri atlayabilir (OSV-Scanner `--x-exclude`). Örneğin dağıtılmayan fixture projeleri.
- **Yönetilen dosyalar ve `--refresh`** ([ADR-0008](../../docs/adr/0008-yonetilen-dosyalar-ve-refresh.md)). `setup`'ın kurduğu `.github/scripts/*` ve `.github/workflows/*` dosyaları artık bir `Managed by governance <sürüm>` işareti ve içerik hash'i taşıyor. `--refresh` bu dosyaları yalnız elle değiştirilmemişlerse günceller. `--print <yol>` setup'ın yazacağı içeriği gösterir. `--adopt <yol>` işaretsiz ya da elle değiştirilmiş bir kopyayı, kullanıcı onayıyla değiştirir. Kayıtlar ve `dependabot.yml` projenin dosyası olarak kalır.
- **Bağımlılık kapısı: önem politikası** ([ADR-0009](../../docs/adr/0009-bagimlilik-kapisi-onem-politikasi.md), ADR-0004'ü değiştirir). Yeni `.github/scripts/dependency-gate.mjs`, iki ayrı OSV-Scanner adımının yerini alıyor.
  - Kırmızı: CVSS 7.0 ve üstü, `MAL-*`, önemi yayımlanmamış bulgular ve allowlist dışı lisanslar.
  - Daha düşük önemdeki açıklar job özetinde raporlanır ve akışı kesmez. Haftalık çalışma bunlar için tek bir `[vulnerability-report]` issue'sunu açık tutar (yalnız bu job `issues: write` alır).
  - OSV-Scanner'ın hata kodları (ör. ağ hatası) kapıyı kırmızıya çevirir (fail closed).
- **Birinci taraf paketler lisans kontrolünden çıkar.** Monorepo'daki workspace paketleri `UNKNOWN` lisansla kapıyı durdurmuyor. Kapı, OSV-Scanner'ın `LOCAL` işaretlediği ve repodaki bir `package.json`'ın tanımladığı paketleri birinci taraf sayar. `osv-scanner.toml`'a istisna gerekmez.
- **Politika proje config'ine taşındı.** Lisans allowlist'i ve eşik `.claude/ideal-agentic-env.json` → `governance.licenses.allow` ve `governance.vulnerabilities.blockAtOrAbove`. `setup` bunları add-only ekler; eski `security.yml`'deki `LICENSE_ALLOWLIST` değerini olduğu gibi taşır.

**Göç (0.1.x'ten):** `/governance:setup --refresh` çalıştır. `security.yml` ve 0.1.2'den kalan `change-audit.mjs` işaretsiz olduğu için `skip` görünür; farkı `--print` ile inceleyip `--adopt .github/workflows/security.yml,.github/scripts/change-audit.mjs` ile değiştir. Güncellemeyen projelerde eski workflow çalışmaya devam eder.

## 0.1.3

- `change-audit`: Her kontrol için yalnız en son koşuyu değerlendiriyor. Önceden, PR açıklaması düzenlenince `concurrency`'nin iptal ettiği eski bir compliance koşusu, yerini yeşil bir koşuya bırakmış olsa bile "failing" sayılıyordu. Bu, marketplace reposunda #8 için yanlış pozitif bir `[change-control]` issue'su (#9) açtı.

## 0.1.2

- Hook kütüphanesindeki glob eşleştirici `{a,b}` alternasyonunu destekliyor (core ile ortak `shared/hooks-lib/paths.mjs`).

## 0.1.1

- Workflow şablonlarındaki action pin'leri bu reponun workflow'larıyla hizalandı (`actions/checkout` v7.0.1, `actions/setup-node` v7.1.0, `actions/upload-artifact` v7.0.2).
- `setup`: Dry run artık algılanan default branch'i ve kurulacak parçaları da yazdırır. Skill metni, dosyaları script'in yazdığını ve bu yüzden core hook'larının onay sormadığını doğru anlatıyor.

## 0.1.0

- `/governance:setup`: projeye compliance ve güvenlik kayıtlarını ve Yasa katmanı CI'ını kurar. Var olan hiçbir dosyanın üzerine yazmaz.
  - Kayıtlar: `docs/compliance/` (veri envanteri, saklama ve imha politikası, erişim matrisi, kontrol haritası, DPIA klasörü) ve `docs/security/` (tehdit modeli, audit log kataloğu, olay müdahale runbook'u).
  - `security` workflow'u: gitleaks, Semgrep CE, OSV-Scanner (açıklar ve lisans allowlist) ve Syft SBOM. Hepsi sürüm ve sha256 ile sabitlenmiş, GHAS gerektirmiyor ([ADR-0004](../../docs/adr/0004-ci-guvenlik-araclari.md)).
  - `compliance` workflow'u: kişisel veri envanteri kapısı ve PR başına compliance raporu.
  - `change-audit` workflow'u: `main`'e gelen her commit'in yeşil kontrollü, merge edilmiş bir PR'dan geldiğini doğrular. Gelmediyse `[change-control]` issue'su açar ([ADR-0003](../../docs/adr/0003-free-planda-yasa-katmani.md)).
  - `dependabot.yml`: GitHub Actions güncellemeleri, 14 günlük cooldown ile.
  - Workflow'lardaki bütün action'lar tam commit SHA'sına pinli.
  - PR'da tarama normalde yalnız yeni bulgulara bakar. PR `security.yml`'i ya da istisna dosyalarını değiştiriyorsa bütün repo taranır.
- Skill'ler: `data-inventory` (keşif script'iyle), `threat-model`, `dpia`, `access-matrix`, `audit-logging`, `retention-and-erasure`, `incident-response`, `control-map`.
- Agent: `compliance-auditor`. Salt okunur, PR için compliance raporu üretir.
- Hook: `inventory-check` (PostToolUse, fail-open). Şema dosyasına kişisel veri gibi görünen bir alan yazılınca envanteri hatırlatır. Aynı dosya ve alan seti için bir kez uyarır.
- Container imaj taraması `devops-selfhosted`'a (Faz 4) ertelendi.
