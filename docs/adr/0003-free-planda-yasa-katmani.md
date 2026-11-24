# ADR-0003: GitHub Free planında Yasa katmanını telafi kontrolleriyle kurmak

- **Durum:** Kabul edildi
- **Tarih:** 2026-11-23

## Bağlam

[ADR-0001](0001-marketplace-mimarisi.md) üç katmanlı bir model kurdu: Tavsiye, Kural ve Yasa. Yasa katmanının atlatılamaz halkası **branch protection** idi: PR açılmadan ve CI yeşil olmadan `main`'e kod girmemeliydi.

GitHub Free planında private repolar için branch protection ve ruleset yok. API `403 Upgrade to GitHub Pro or make this repository public` döndürüyor. Repo düzeyinde auto-merge de kapalı. Kullanıcı ücretsiz planda kalmaya karar verdi. Bu durum hem bu marketplace reposunu hem de takımın private proje repolarını etkiliyor.

Free planda private repolarda şunlar da kullanılamıyor (GitHub Advanced Security gerektiriyorlar):

- CodeQL code scanning
- `dependency-review-action`
- secret scanning push protection

Buna karşılık Actions (aylık dakika kotasıyla), Dependabot alerts ve Dependabot version updates kullanılabiliyor.

## Karar

Branch protection'ın sağladığı güvenceyi **önleyici** ve **tespit edici** telafi kontrolleriyle karşılıyoruz. Bunları uygulayan ve kanıtını üreten taraf `core` ile `governance` plugin'leridir.

1. **Önleyici, Claude için (Kural):** `core` içindeki `shell-guard`, korumalı bir branch'e (`main`, `master`, `develop`, `release/*`, `prod*`) doğrudan yapılan **her** push için onay ister. Buna `git push` ile mevcut branch'in örtük push'u da dahildir. Korumalı branch'e force push ise reddedilir.
2. **Önleyici, insan için (Yasa, atlatılabilir):** `core:init`, `.githooks/pre-push` kurar ve `core.hooksPath` ayarını yapar. Bu hook, korumalı branch'e doğrudan push'u durdurur. `--no-verify` ile atlatılabilir. Claude bu bayrağı kullanmak isterse `shell-guard` onay ister.
3. **Tespit edici (Yasa):** `governance`'ın `change-audit` workflow'u `main`'e gelen her push'ta çalışır ve iki şeyi doğrular:
   - Her commit merge edilmiş bir PR'dan gelmiş olmalı.
   - O PR'ın head commit'indeki kontroller yeşil olmalı.

   Bu şartlar sağlanmazsa job kırmızıya döner ve repoda `[change-control]` başlıklı bir issue açılır. Böylece istisna kalıcı ve denetlenebilir bir kayda dönüşür.
4. **CI kalitesi (Yasa):** Güvenlik taramaları GHAS'a bağlı değildir. Runner üzerinde açık kaynak araçlar çalışır ([ADR-0004](0004-ci-guvenlik-araclari.md)). Kişisel veri envanteri kapısı (`compliance` workflow'u) ayrı ve hafif bir job'dır.
5. **Süreç:** PR'lar yalnız bütün kontroller yeşilken ve insan onayıyla merge edilir. `gh pr merge` için `shell-guard` her zaman onay ister.
6. **Plan farkındalığı:** `core:init`, branch protection'ı kullanılabildiği yerde (public repo, Pro, Team) önermeye devam eder. Telafi kontrolleri her durumda kurulur. Branch protection açılırsa bu kontroller zararsız bir ikinci savunma hattı olarak kalır.

## Sonuçlar

**Olumlu**

- Ücret ödenmeden SOC 2 CC8.1 / ISO 27001 A.8.32 (değişiklik yönetimi) için sürekli ve otomatik kanıt üretilir: her `main` commit'i bir PR'a, PR da yeşil kontrollere bağlanır.
- İstisnalar sessizce kaybolmaz. Her biri bir issue olarak kayda geçer.
- Kontroller plandan bağımsızdır. Repo ileride Pro planına geçer ya da public olursa kod değişmeden çalışmaya devam eder.

**Olumsuz ve riskler**

- Önleme tam değildir. Yetkili bir insan `--no-verify` veya web arayüzü ile `main`'e doğrudan yazabilir. Bunu ancak sonradan **tespit** ederiz. Denetçi açısından bu bir "detective control"dür ve istisna kayıtları düzenli gözden geçirilmelidir.
- `core.hooksPath` her klonda bir kez ayarlanmalıdır. `core:init` bunu mevcut klon için yapar; diğer takım arkadaşları README'deki tek komutu çalıştırır.
- Actions dakika kotası sınırlıdır ve Windows/macOS runner'ları daha pahalı sayılır. Bu yüzden governance workflow'ları tek bir ubuntu job'ıyla sınırlı tutulur. Bu reponun kendi üç platformlu CI'ının maliyeti ayrıca izlenmelidir.

## Değerlendirilen alternatifler

- **GitHub Pro veya Team'e geçmek:** En güçlü çözüm, ama kullanıcı ücretsiz planda kalmaya karar verdi. Plan yükseltilirse branch protection açılır ve bu ADR'nin kontrolleri ikinci savunma hattı olarak kalır.
- **Repoyu public yapmak:** Branch protection ücretsiz hale gelir, ama iç kurallar ve süreçler dışarıya açılır ([ADR-0001](0001-marketplace-mimarisi.md)).
- **Yalnız disiplin ("main'e push etmeyiz"):** Hiçbir kanıt üretmez. SOC 2 ve ISO 27001 açısından kabul edilemez.

## Bağlantılar

- [docs/PLAN.md §2](../PLAN.md), [ADR-0001](0001-marketplace-mimarisi.md), [ADR-0004](0004-ci-guvenlik-araclari.md)
