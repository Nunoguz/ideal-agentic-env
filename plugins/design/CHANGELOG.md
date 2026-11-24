# Changelog — design

## 1.0.0

- Stabil: 1.x içinde kırıcı değişiklik yok; kırıcı her değişiklik major sürüm ve göç notuyla gelir ([ADR-0012](../../docs/adr/0012-v1-surum-sozu.md)). 0.1.2'ın üzerine yalnız bu bölümdeki maddeleri getirir.
- Ortak setup kütüphanesi (`stack-lib.mjs`) güncellendi: Maven/Gradle manifestleri, `dependencyPrefixes` koşulu, platforma göre verify komutu, koşullu Dependabot girdisi. LSP kontrolü binary'yi artık çalıştırmıyor, PATH'te arıyor. Bu plugin'in davranışı değişmedi.

## 0.1.2

- `setup`: Kurduğu CI script'leri artık yönetilen dosya ([ADR-0008](../../docs/adr/0008-yonetilen-dosyalar-ve-refresh.md)). `--refresh` onları elle değiştirilmemişlerse günceller; `--print <yol>` yazılacak içeriği gösterir; `--adopt <yol>` işaretsiz ya da elle değiştirilmiş bir kopyayı kullanıcı onayıyla değiştirir.
- `setup`: Kural dosyasında yalnız işaretteki sürüm değiştiyse dosya "outdated" sayılmıyor; `--refresh` gereksiz bir değişiklik üretmiyor.
- Ortak setup kodu stack sözleşmesi v2'ye geçti ([ADR-0010](../../docs/adr/0010-stack-sozlesmesi-v2.md)): `.csproj` manifestleri, `sdk`/`fileContains` koşulları, `{solution}` yer tutucusu ve `ci.yml` blokları.
- `setup`: `@playwright/test` olan bir UI paketinde `ci.yml`'e, `verify --full`'dan sonra ui-verify ekran görüntülerini ve Playwright raporunu artifact olarak yükleyen adımı ekler.

## 0.1.1

- Setup, aynı formatter'ı başka bir plugin'in zaten çalıştırdığı dosyalar için tekrar eklemiyor; yalnız kapsanmayan uzantıları ekliyor. Önceden stack-node ve stack-web birlikte kurulunca prettier `.ts` dosyalarında iki kez çalışıyordu (ortak `stack-lib.mjs`).

## 0.1.0

- `token-lint.mjs` (projeye `.github/scripts/` altında kurulur, `verify.fast` adımı): UI dosyalarına eklenen satırlarda, token dosyaları dışındaki sabit renk ve ölçüleri yakalar. Gerekçeli `allow` notunu kabul eder.
- Kural: `ui.md` (dört durum, klavye, kontrast, responsive, motion, dark mode, metin).
- Skill'ler:
  - `setup`
  - `design-direction`: `DESIGN.md` şablonu, token şablonu ve klişe listesiyle.
  - `ui-build`
  - `ui-verify`: Playwright + axe spec'iyle.
- Agent: `design-critic` (salt okunur).

## 0.0.1

- İskelet oluşturuldu (Faz 0).
