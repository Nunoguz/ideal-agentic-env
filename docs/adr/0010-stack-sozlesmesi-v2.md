# ADR-0010: Stack sözleşmesi v2: npm dışı manifestler ve CI katkısı

- **Durum:** Kabul edildi
- **Tarih:** 2026-11-23
- **Genişlettiği karar:** [ADR-0006](0006-stack-sozlesmesi.md)

## Bağlam

[ADR-0006](0006-stack-sozlesmesi.md), yeni bir stack eklemeyi "kod değil, sözleşme yazmak" olarak tanımladı. Faz 3'teki dört plugin'in hepsi npm tabanlıydı ve ortak kod da buna göre yazıldı:

- Algılama yalnız `package.json` okuyordu.
- Verify adımları kök `package.json`'daki script'lere bağlıydı.
- Lockfile notları npm'e göreydi.

Faz 4'te `stack-dotnet` geliyor. .NET'te manifest `*.csproj`, lockfile `packages.lock.json`, build komutu bir solution dosyası istiyor. Bu haliyle sözleşme .NET'i anlatamıyor.

İkinci boşluk CI'daydı. Örnek uygulamada `verify --full`'un CI'da yeşil olması için `ci.yml`'e üç şey elle eklendi:

- Postgres service container,
- Playwright tarayıcı kurulumu,
- ui-verify ekran görüntülerinin artifact olarak yüklenmesi.

Stack plugin'lerinin `ci.yml`'e katkı yapmanın bir yolu yoktu. `ci.yml` projenin dosyası, proje kendi job'larını ekliyor; bu yüzden onu bütünüyle yönetilen dosya yapamayız ([ADR-0008](0008-yonetilen-dosyalar-ve-refresh.md)).

## Karar

### 1. Manifestler

`shared/stack-lib.mjs` iki tür manifest okur:

- `package.json` (`ecosystem: "npm"`),
- `*.csproj` ve `*.fsproj` (`ecosystem: "dotnet"`). Bağımlılıklar `PackageReference Include/Update`'ten, `sdk` ise `<Project Sdk="…">` ya da `<Sdk Name="…"/>`'dan okunur.

Sözleşme ve profil bir `ecosystem` alanı alır (varsayılan `npm`). `scope: "package"` olan bir profil kendi ekosisteminin her manifesti için ayrı değerlendirilir. Python ve Gradle Faz 5'te aynı arayüze eklenecek.

### 2. Yeni koşullar

`sdk: [..]`, `fileContains: {dosya: metin}` ve `notFileContains`. Böylece örneğin CSharpier `.config/dotnet-tools.json`'da tanımlıysa formatter olarak o, değilse `dotnet format whitespace` seçilir. İki formatter aynı dosyaya hiç çalışmaz.

### 3. Verify yer tutucusu

`run` içindeki `{solution}`, repo kökündeki solution dosyasıyla değiştirilir. Önce `.slnx` (.NET 10'un varsayılanı), sonra `.sln` aranır. Kökte solution yoksa adım eklenmez ve setup bunu not olarak söyler.

### 4. CI katkısı

core'un `ci.yml` şablonundaki verify job'ında üç bölge bulunur:

| Bölge | Yeri | Ne konur |
| --- | --- | --- |
| `services` | job'ın `steps:` satırından önce | Veritabanı gibi job service'leri |
| `steps` | `verify --full` adımından önce | Toolchain ve tarayıcı kurulumu |
| `after` | `verify --full` adımından sonra | Artifact yükleme |

- **Bölgenin işaretleri:** `# >>> ideal-agentic-env:<bölge>` ile `# <<< ideal-agentic-env:<bölge>` arasında durur. Her plugin'in bloğu `# --- <plugin> <sürüm>` satırıyla başlar.
- **Parçalar:** Plugin'ler `stack.json` → `ci.<bölge>` altında `ci/*.yml` parçalarını koşullarıyla listeler. `{{DIR}}` yer tutucusu, koşulu sağlayan ilk paketin dizinine çevrilir.
- **Yazma kuralı:** Setup yalnız kendi bloğunu yazar. Blok değişmişse onu yalnız `--refresh` yeniler. Bölge dışı projenindir.
- **Tekrar önleme:** Projenin zaten kullandığı bir action, zaten çalıştırdığı bir komut ya da tanımladığı bir service eklenmez; setup bunun yerine not yazar.
- **Eski projeler:** core 0.4.0'dan önce kurulmuş bir `ci.yml`'e setup bölgeleri kendisi ekler. Ancak job'da işaretlerin dışında bir `services:` varsa ikinci bir `services:` anahtarı açmaz (YAML'da geçersiz olur). Bu durumda ne yapılacağını not olarak söyler.

### 5. Yasa katmanı

`npm run validate` şunları denetler:

- `ci/*.yml` parçalarındaki action'lar commit SHA'sına pinli olmalı. Pin eşliğini `scripts/pins.mjs` kontrol eder.
- Parçalardaki container imajları `@sha256:` digest'ine pinli olmalı.
- `ecosystem` değerleri ve `ci` alanının şekli doğru olmalı.

## Sonuçlar

**Olumlu**

- .NET bir sözleşme dosyasıyla eklenebiliyor. Kalan ekosistemler için tek bir arayüz var.
- Bir stack'in CI'da yeşil olması için gereken parçalar plugin'le birlikte geliyor ve `--refresh` ile güncelleniyor. Örnek uygulamadaki elle genişletme artık gerekmiyor.
- Proje `ci.yml`'in geri kalanını özgürce düzenleyebiliyor.

**Olumsuz ve riskler**

- `ci.yml`'e YAML ayrıştırıcısı olmadan, satır bazında yazılıyor. İşaretler elle bozulursa setup bloğu yazmaz ve not düşer. Bu yüzden testler girintiyi ve tekrar çalıştırmada değişiklik olmamasını (idempotency) ayrıca doğruluyor.
- Bağlantı ayarı (connection string) projeye özgü olduğu için setup onu yazmaz, nasıl ayarlanacağını not olarak söyler. CI'ın yeşil olması bu adıma bağlı.
- `{{DIR}}` yalnız ilk eşleşen paketi alır. Aynı tarayıcıyı iki pakette kuran bir monorepo kurulumu elle genişletmeli.

## Değerlendirilen alternatifler

- **`ci.yml`'i bütünüyle yönetilen dosya yapmak:** Projenin eklediği job'lar refresh'te kaybolurdu.
- **Stack başına ayrı reusable workflow:** Service container'lar çağıran job'da tanımlanmalı ve `verify --full` tek bir job'da koşmalı. Ayrı workflow'lar dakika ve karmaşıklık ekler.
- **Parçaları `stack.json` içinde JSON olarak tutmak:** Pin eşliği ve okunabilirlik zorlaşırdı. `ci/*.yml` dosyaları workflow'larla aynı biçimde.

## Bağlantılar

- [ADR-0006](0006-stack-sozlesmesi.md), [ADR-0008](0008-yonetilen-dosyalar-ve-refresh.md), `shared/stack-lib.mjs`, `scripts/stack-lib.test.mjs`, `plugins/core/skills/init/templates/.github/workflows/ci.yml.tmpl`
