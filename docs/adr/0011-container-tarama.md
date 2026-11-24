# ADR-0011: Container imajlarını ve deploy dosyalarını Trivy ile taramak

- **Durum:** Kabul edildi
- **Tarih:** 2026-11-23
- **Tamamladığı karar:** [ADR-0004](0004-ci-guvenlik-araclari.md) (container taraması `devops-selfhosted`'a ertelenmişti), [ADR-0009](0009-bagimlilik-kapisi-onem-politikasi.md) (önem politikası)

## Bağlam

governance'ın `security` workflow'u kaynak kodu ve lockfile'ları tarıyor. İmajın içindekileri görmüyor: taban imajın işletim sistemi paketleri, imaja kopyalanan dosyalar (ör. yanlışlıkla eklenmiş bir `.env`) ve yanlış yapılandırmalar (root kullanıcı, pinlenmemiş taban imaj). [ADR-0004](0004-ci-guvenlik-araclari.md) bu taramayı imajı üreten plugin'e, yani `devops-selfhosted`'a erteledi.

Adaylar:

| Araç | Lisans | Ne tarar |
| --- | --- | --- |
| **Trivy** (Aqua Security) | Apache-2.0 | İmaj açıkları (OS ve dil paketleri), imajdaki secret'lar, Dockerfile/Compose/Kubernetes/Helm yanlış yapılandırması |
| **Grype** (Anchore) | Apache-2.0 | İmaj açıkları. Syft SBOM'unu okuyabilir |
| hadolint, kubesec, kube-linter | çeşitli | Yalnız yanlış yapılandırma; her biri ayrı bir binary |

## Karar

1. **Trivy**, tek bir binary ile hem imaj açıklarını ve secret'ları hem de deploy dosyalarının yanlış yapılandırmasını tarar. Ayrı bir linter almıyoruz.
2. **Sabitleme:** [ADR-0004](0004-ci-guvenlik-araclari.md)'teki kurallar geçerli.
   - Binary resmî release'ten indirilir ve sha256'sı her çalışmada doğrulanır. Sürüm 0.76.2; checksum'ı `trivy_0.76.2_checksums.txt` dosyasından alındı.
   - Sürüm 14 gün bekletilir.
   - GitHub Action'ı (`trivy-action`) kullanılmaz.
3. **Politika** ([ADR-0009](0009-bagimlilik-kapisi-onem-politikasi.md) ile uyumlu):
   - **Kırmızı:**
     - düzeltilmiş sürümü olan High/Critical açık,
     - önemi bilinmeyen ama düzeltmesi olan açık (fail closed),
     - imaja gömülmüş secret,
     - High/Critical yanlış yapılandırma.
   - **Yalnız rapor:** henüz düzeltmesi olmayan High/Critical açık. Repo sahibi 2026-11-23'te bu seçeneği seçti, alternatifi bunları da kırmızı yapmaktı. Gerekçe: bu açıklar çoğunlukla taban imajın işletim sistemi paketlerinde çıkar (Debian ve Ubuntu'nun "will not fix" kayıtları gibi) ve projede kimse düzeltemez. Düzeltme yayımlanınca bir sonraki tarama kırmızıya döner. Daha düşük önemler ve desteği bitmiş taban işletim sistemi de rapora düşer.
   - **Takip:** Haftalık çalışma, rapora düşen bulgular için tek bir `[vulnerability-report]` issue'sunu açık tutar.
   - **İstisna:** `.trivyignore` dosyasına gerekçe ve `exp:YYYY-MM-DD` ile yazılır. Kararı repo sahibi verir.
4. **Ne zaman çalışır:** PR'da yalnız Dockerfile, Compose, Kubernetes ve Helm dosyaları, `.trivyignore` ya da workflow değiştiğinde; ayrıca `main`'e push'ta ve haftalık. Dakika maliyeti böylece sınırlı kalır. İmaj içeriğini etkileyen lockfile değişikliklerini governance'ın bağımlılık kapısı zaten tarıyor.
5. **Hangi imajlar:** `.claude/ideal-agentic-env.json` → `devops.images` listesi. Liste yoksa repodaki her Dockerfile, repo kökünden build edilir (monorepo'da paylaşılan paketler için doğru bağlam).

## Sonuçlar

**Olumlu**

- İmaja gömülü secret ve root kullanıcı gibi hatalar merge'den önce yakalanır.
- Yanlış yapılandırma taraması kurallarla (`dockerfile.md`, `kubernetes.md`) aynı şeyi söyler: Tavsiye, Kural ve Yasa katmanları aynı şeyi bekler.
- Tek bir ek binary.

**Olumsuz ve riskler**

- Trivy çalışırken açık veritabanını indirir (`mirror.gcr.io`). İndirme başarısız olursa kapı kırmızıya döner.
- Düzeltmesi olmayan bir Critical açık akışı durdurmaz. Haftalık issue'nun izlenmesi gerekir; taban imajı küçültmek (distroless, chiseled) bu açıkların sayısını azaltır.
- Bu makinede Docker'ın sanal diski dolu olduğu için imaj build'i ve taraması yerelde doğrulanamadı. Doğrulama fixture CI'ında ve örnek repoda yapılır.

## Değerlendirilen alternatifler

- **Grype + hadolint:** İki binary ve iki ayrı politika. Grype, Syft SBOM'uyla iyi uyum sağlıyor, ama yanlış yapılandırma için yine ayrı bir araç gerekirdi.
- **`trivy-action`:** Değiştirilebilir tag'ler ve ek bir bağımlılık. Doğrulanmış binary daha şeffaf ([ADR-0004](0004-ci-guvenlik-araclari.md)).
- **Düzeltmesi olmayanları da kırmızı yapmak:** Repo sahibi akışı kesmemeyi seçti.

## Bağlantılar

- `plugins/devops-selfhosted/skills/setup/templates/.github/workflows/container.yml.tmpl`, `.../.github/scripts/container-scan.mjs.tmpl`
