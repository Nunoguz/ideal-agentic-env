# governance

> **Durum:** Stabil, 1.0.0. Her projede zorunlu.

Uyumun mühendislik tarafını ve kanıtını üretir: KVKK/GDPR, SOC 2 ve ISO 27001. Uyumu kendisi **sağlamaz**. Sertifikasyon, hukuki sebep seçimi ve risk kabulü insanın (DPO, denetçi, yönetim) kararıdır. Plugin bu kararlar için gerçekleri ve kanıtı hazırlar.

## Kurulum

```bash
claude plugin install governance@ideal-agentic-env --scope project
```

Sonra projede `/core:init`'ten sonra `/governance:setup` çalıştır.

## Katmanlar

| Katman | Ne yapar |
| --- | --- |
| **Tavsiye** (skill'ler) | Kayıtları tutar ve kodun bu kayıtlara uymasını sağlar. |
| **Kural** (hook) | `inventory-check`: şema dosyasına (migration, model, entity, şema) kişisel veri gibi görünen bir alan yazılınca Claude'a envanteri hatırlatır. Fail-open çalışır, engellemez. |
| **Yasa** (CI) | `security`, `compliance` ve `change-audit` workflow'ları. İnsan için de geçerlidir. |

## CI (Yasa katmanı)

`/governance:setup` üç workflow ve bunların script'lerini kurar. Hepsi tek ubuntu job'ıyla çalışır ve GitHub Advanced Security gerektirmez. Bu yüzden Free planda private repoda da çalışırlar.

- **`security`:** gitleaks, Semgrep CE, bağımlılık kapısı (OSV-Scanner) ve Syft (SBOM).
  - PR'da secret ve SAST taramasında yalnız yeni bulgular kırmızıya çevirir.
  - PR `security.yml`'i ya da istisna dosyalarını (`.gitleaks.toml`, `.gitleaksignore`, `.semgrepignore`, `osv-scanner.toml`) değiştiriyorsa bütün repo ve geçmişi taranır. Böylece governance'ı kuran PR, eski bulguları merge'den önce gösterir.
  - `main`'de ve haftalık zamanlanmış çalışmada bütün repo taranır.
- **Bağımlılık kapısı** (`.github/scripts/dependency-gate.mjs`, [ADR-0009](../../docs/adr/0009-bagimlilik-kapisi-onem-politikasi.md)): Politika projenin `.claude/ideal-agentic-env.json` dosyasında, `governance` altında durur.
  - **Kırmızı:** CVSS 7.0 ve üstü (`vulnerabilities.blockAtOrAbove`), kötü niyetli paket (`MAL-*`), önemi yayımlanmamış bulgu ve allowlist dışı lisans (`licenses.allow`).
  - **Yalnız rapor:** daha düşük önemdeki açıklar. Job özetinde listelenir; haftalık çalışma bunlar için tek bir `[vulnerability-report]` issue'sunu açık tutar ve hepsi kapanınca issue'yu kapatır.
  - **Birinci taraf paketler** (npm workspace üyeleri, Maven build'in kendi modülleri) lisans kontrolünden kendiliğinden çıkar. İstisna dosyasına girmeleri gerekmez.
  - **Maven:** lockfile olmadığı ve OSV-Scanner parent pom/BOM'un yönettiği sürümleri çözemediği için kapı, Maven'a çözülmüş ağacı CycloneDX SBOM olarak ürettirir ve onu tarar. Compile ve runtime kapsamı taranır, test kapsamı taranmaz. Bunun için runner'da Java gerekir; GitHub'ın `ubuntu-latest` imajında hazır gelir. Ağaç çözülemezse kapı kırmızıdır. Lisanslar paketlerin kendi pom'larından okunur. Bir pom birden çok lisans listeliyorsa bunlar seçim sayılır, biri allowlist'teyse yeter (repo sahibinin kararı, 2026-11-24).
  - Rapor kaç paketi hangi kaynaktan taradığını yazar. Hiçbir şey görmeyen bir tarama böylece fark edilir.
- **`compliance`:** Şema dosyalarına kişisel veri gibi görünen alan ekleyen bir PR'ı kırmızıya çevirir. Bunu önlemenin iki yolu var:
  - `docs/compliance/data-inventory.md` güncellenir.
  - PR açıklamasında envanter checkbox'ı işaretlenir ya da `Inventory: not needed — <gerekçe>` satırı yazılır. Bu bir insan beyanıdır ve kayıtta kalır.

  Her PR için job özetine bir **compliance raporu** yazılır.
- **`change-audit`:** `main`'e gelen her push'tan sonra çalışır. Her commit'in yeşil kontrollü, merge edilmiş bir PR'dan geldiğini doğrular. Gelmediyse job kırmızıya döner ve `[change-control]` issue'su açılır. Branch protection olmayan planda değişiklik yönetiminin ana kontrolü budur ([ADR-0003](../../docs/adr/0003-free-planda-yasa-katmani.md)).

### Tarayıcıları güncellemek

Sürümler ve sha256 değerleri `security.yml`'deki `env:` bloğundadır ([ADR-0004](../../docs/adr/0004-ci-guvenlik-araclari.md)):

1. En az 14 gün önce yayınlanmış bir sürüm seç.
2. Resmî release'in checksum dosyasından `linux` asset'inin sha256 değerini al.
3. Değerleri güncelle ve bir PR aç.

### Kurulu bir projeyi güncellemek

`setup`'ın kurduğu CI script'leri ve workflow'lar **yönetilen dosyadır** ([ADR-0008](../../docs/adr/0008-yonetilen-dosyalar-ve-refresh.md)): ilk satırlarında `Managed by governance <sürüm>` işareti ve içeriğin hash'i vardır. Plugin'i yükselttikten sonra:

1. `/governance:setup --refresh` çalıştır. Dry run, elle değiştirilmemiş dosyalar için `update` gösterir.
2. Elle değiştirilmiş ya da işaretsiz (0.1.x'ten kalma) bir dosya `skip` olur. Farkı `--print <yol>` ile gör. Değiştirmeyi kabul edersen `--adopt <yol>` ile yeniden çalıştır.
3. Değişikliği bir PR ile gönder.

Kayıtlar (`docs/`) ve `dependabot.yml` projenin dosyasıdır. `setup` onların üzerine hiç yazmaz.

### İstisnalar

Her istisna gerekçeli bir PR ile eklenir. Kontrol asla kapatılmaz.

| Tarayıcı | İstisna nasıl eklenir |
| --- | --- |
| gitleaks | Önce secret döndürülür, sonra bulgunun fingerprint'i `.gitleaksignore`'a eklenir. |
| Semgrep | Satıra `// nosemgrep: <rule-id> <gerekçe>` yazılır. |
| OSV-Scanner | `osv-scanner.toml` içinde `[[IgnoredVulns]]` (`ignoreUntil` ile) ya da `[[PackageOverrides]]` (`effectiveUntil` ile) kullanılır, `reason` zorunlu. Yalnız kırmızı bulgular için gerekir; rapora düşen açıklar istisna istemez. |

İstisna eklemek, allowlist'i ve eşiği değiştirmek repo sahibinin kararıdır. Claude bulguyu ve seçenekleri sunar, sahibin onayı olmadan istisna yazmaz.

## Skill'ler

| Skill | Ne zaman | Kayıt |
| --- | --- | --- |
| `/governance:setup` | Projeye kurarken (yalnız elle çağrılır) | — |
| `data-inventory` | Kişisel veri, yeni amaç, yeni işleyen ya da yurt dışına aktarım eklendiğinde | `docs/compliance/data-inventory.md` |
| `retention-and-erasure` | Saklama süresi, silme, imha ve "verimi silin" talepleri için | `docs/compliance/retention-policy.md` |
| `access-matrix` | Yeni rol, yetki, endpoint ya da admin yeteneği eklendiğinde; üç aylık erişim gözden geçirmesinde | `docs/compliance/access-matrix.md` |
| `audit-logging` | Hassas bir aksiyon eklendiğinde (giriş, yetki değişikliği, dışa aktarım, admin işlemi) | `docs/security/audit-logging.md` |
| `threat-model` | Bir güven sınırı (trust boundary) değiştiğinde | `docs/security/threat-model.md` |
| `dpia` | Yüksek riskli işleme olduğunda (özel nitelikli veri, profilleme, izleme, yapay zekâ) | `docs/compliance/dpia/` |
| `incident-response` | Olay ya da veri ihlali anında (72 saat), olay sonrası değerlendirmede ve tatbikatta | `docs/security/incident-response.md` |
| `control-map` | Bir kontrol eklendiğinde ya da zayıfladığında; denetim öncesi kanıt toplarken | `docs/compliance/control-map.md` |

## Agent

**`compliance-auditor`** salt okunurdur. Bir diff'i bütün kayıtlara karşı denetler ve şunları döndürür:

- bulgu tablosu,
- PR'ın kanıt ürettiği kontroller,
- insanın vermesi gereken kararlar,
- PR'a konacak tek paragraflık özet.

`core`'un `pre-pr` skill'i bu agent'ı otomatik çağırır.

## Proje ayarı

İsteğe bağlı. `.claude/ideal-agentic-env.json` içinde:

```json
{
  "governance": {
    "schemaPaths": ["src/contracts/**"],
    "piiTerms": ["customer number"],
    "inventoryPath": "docs/compliance/data-inventory.md"
  }
}
```

Hook ve CI kapısı bu ayarı aynı şekilde okur.
