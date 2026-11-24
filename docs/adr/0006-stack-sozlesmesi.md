# ADR-0006: Stack plugin'leri için tek bir sözleşme: `stack.json` ve ortak setup

- **Durum:** Kabul edildi. [ADR-0010](0010-stack-sozlesmesi-v2.md) npm dışı manifestler ve CI katkısıyla genişletti; [ADR-0008](0008-yonetilen-dosyalar-ve-refresh.md) yönetilen kural modelini setup'ın kurduğu CI dosyalarına taşıdı.
- **Tarih:** 2026-11-23

## Bağlam

[PLAN.md §4.5](../PLAN.md), her stack plugin'inin aynı parçaları sağlamasını istiyor:

- path-scoped kurallar
- `scaffold`, `test` ve `upgrade-deps` skill'leri
- LSP
- `format-dispatch`'e formatter kaydı
- `scripts/verify`'a katkı
- guardrail'ler
- Dependabot ekosistemi

Faz 3'te bu sözleşmeyi dört plugin uygulayacak: `stack-node`, `stack-web`, `data-sql` ve `design`. Faz 4'te beş tane daha gelecek.

Kısıtlar:

- **Kurallar plugin'den yüklenmiyor.** Claude Code'un plugin bileşenleri arasında `rules` yok. Path-scoped kurallar ancak projenin `.claude/rules/` klasöründe çalışır, bu yüzden bir setup adımının onları projeye yazması gerekir.
- **Kullanıcı yalnız ihtiyacını almalı.** Örneğin `.NET` backend ve Vue frontend kullanan bir projeye React kuralı gelmemeli. Monorepo'da da backend kuralları frontend dosyalarına yüklenmemeli.
- **Context bütçesi.** Her oturumda yüklenen her satır her projede para ve dikkat harcar (PLAN §7).
- **Her plugin yalnız kendi klasörünü taşır.** Plugin'ler arasında kod paylaşımı yalnız `shared/` kopyalarıyla mümkün.

## Karar

1. **Sözleşme bir veri dosyasıdır: `<plugin>/stack.json`.**
   - `profiles` alanı her profil için şunları tanımlar:
     - `detect`: bağımlılık, bağımlılık yokluğu ve dosya koşulları. Bir dizi verilirse koşullardan herhangi biri yeterlidir.
     - `paths`: kuralların yükleneceği yollar.
     - `rules`: profilin kural dosyaları.
     - `scope`: `package` ya da `repo`.
     - `config`: proje config'ine eklenecek listeler ve ayarlar.
   - Bunlara ek olarak `format`, `verify`, `dependabot`, `lsp` ve `templates` alanları vardır.
   - Yeni bir stack eklemek böylece mekanik bir işe döner: `stack.json` + `rules/` + skill'ler.
2. **Setup kodu tektir.**
   - `shared/stack-lib.mjs` ve `shared/stack-setup.mjs` her plugin'in `skills/setup/scripts/` klasörüne kopyalanır (`npm run sync`).
   - Plugin'e özgü kod yazılmaz. Özgü olan yalnız sözleşmedir.
3. **Algılama paket bazındadır.**
   - `scope: "package"` olan bir profil her `package.json` için ayrı değerlendirilir. Kural yolları paket dizinine göre öneklenir; örneğin `apps/api/**/*.ts`.
   - Workspace kökü tek başına hiçbir profile girmez.
   - Brace ifadeleri (`{ts,tsx}`) kurala yazılırken açılır. Böylece Claude Code'un glob davranışına güvenilmez.
4. **Setup add-only çalışır ve sıra bağımlıdır.**
   - Kural dosyalarını `.claude/rules/<plugin>/` altına yazar.
   - `.claude/ideal-agentic-env.json` içindeki `format`, `verify` ve listelere yalnız ekleme yapar.
   - `.github/dependabot.yml` dosyasına kendi ekosistemini ekler.
   - Önkoşul dosyası yoksa (core:init ya da governance:setup çalışmamışsa) o parçayı atlar ve nedenini söyler. Başka bir plugin'in dosyasını sıfırdan yaratmaz.
5. **Yönetilen kurallar işaretlidir.**
   - Setup'ın yazdığı kural dosyası bir `Managed by <plugin> <version>` satırı taşır.
   - `--refresh` yalnız bu işareti taşıyan dosyaları günceller.
   - Projeye özel kurallar başka dosyalarda durur ve setup onlara asla dokunmaz.
6. **Skill çağrısı ve context.**
   - Projeyi değiştiren `setup`, `scaffold` ve `upgrade-deps` skill'leri `disable-model-invocation: true` ile işaretlenir ve yalnız slash komutuyla çalışır.
   - Gerçek bir oturumda (`claude -p`, 2.1.326) bu skill'lerin modelin listesine girmediği doğrulandı. Yani açıklamaları sabit context'e eklenmiyor. `claude plugin details` ise onları yine de sayıyor.
7. **LSP.**
   - Her stack plugin'i kendi `.lsp.json` dosyasını taşır.
   - İki plugin aynı uzantıyı kaydederse (stack-web ve stack-node, `.ts`) Claude Code ilkini kullanır, ikincisi için uyarı yazar ve devam eder. Bu da gerçek oturumda doğrulandı.
   - LSP binary'sini plugin kurmaz. Setup binary'nin olup olmadığına bakar ve kurulum komutunu söyler.
8. **Yasa katmanı.** `npm run validate` şunları zorlar:
   - **Sürümü 0.0.x'ten büyük her `stack-*` plugin'i için:**
     - `stack.json`'ın şeması,
     - atıf yapılan kural dosyalarının var olması ve sahipsiz kural dosyası olmaması,
     - `setup`, `scaffold`, `test` ve `upgrade-deps` skill'leri,
     - `.lsp.json` ve `lsp.binary`,
     - `setup`'ın elle çağrılır olması.
   - **Her plugin için sabit context bütçesi:**
     - model tarafından çağrılabilen skill'ler ve agent'lar için en fazla 900 token açıklama,
     - anayasa için en fazla 1.000 token.

## Sonuçlar

**Olumlu**

- "Yalnız gerekeni al" iki düzeyde sağlanıyor:
  - Proje yalnız ihtiyacı olan plugin'i kurar.
  - Plugin de yalnız algılanan profilin kurallarını, yalnız ilgili paketin yollarına yazar.
- Bir kural dosyası ancak eşleşen bir dosyaya dokunulunca context'e girer. Gerçek oturumda doğrulandı: Next paketine dokununca Node kuralları yüklenmedi.
- Dokuz plugin'in setup'ı tek bir kod tabanı. Bir hata tek yerde düzeltilir ve `npm run sync` ile dağıtılır.

**Olumsuz ve riskler**

- Kurallar projeye kopyalandığı için plugin güncellemesi onlara kendiliğinden ulaşmaz. Her yükseltmeden sonra `--refresh` gerekir. CHANGELOG'da kural değişikliği bu yüzden ayrıca belirtilir.
- Algılama sezgiseldir. Örneğin hiçbir frontend bağımlılığı olmayan bir paket `node` sayılır. Yanlış algılamada `--profiles` ile düzeltilir; dry run ve kullanıcı onayı bu yüzden zorunludur.
- `dependabot.yml`'a YAML ayrıştırıcısı olmadan, metin sonuna ekleme yapılıyor. `updates:` son üst düzey anahtar değilse setup ekleme yapmaz, nedenini söyler.

## Değerlendirilen alternatifler

- **Kuralları bir hook ile enjekte etmek (PostToolUse `additionalContext`):** Kopyalama olmazdı ve kurallar hep güncel kalırdı. Ama kural, ilk dosya yazıldıktan sonra gelirdi. Claude Code'un kendi path-scoped kural mekanizması daha erken ve daha güvenilir.
- **Her plugin'e kendi setup script'i:** Dokuz kopya ayrı ayrı evrilirdi ve ortak hatalar dokuz kez düzeltilirdi.
- **Kuralları tek dosyada, bütün projeye:** Monorepo'da backend kuralları frontend dosyalarına da yüklenirdi. Kullanıcının açık isteğine aykırı.

## Bağlantılar

- [PLAN.md §4.5](../PLAN.md), [ADR-0002](0002-cok-platformlu-hook-tasarimi.md), `shared/stack-lib.mjs`, `scripts/validate.mjs`
