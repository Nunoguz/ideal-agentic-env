# Changelog — stack-node

## 1.0.0

- Stabil: 1.x içinde kırıcı değişiklik yok; kırıcı her değişiklik major sürüm ve göç notuyla gelir ([ADR-0012](../../docs/adr/0012-v1-surum-sozu.md)). 0.1.2'ın üzerine yalnız bu bölümdeki maddeleri getirir.
- Ortak setup kütüphanesi (`stack-lib.mjs`) güncellendi: Maven/Gradle manifestleri, `dependencyPrefixes` koşulu, platforma göre verify komutu, koşullu Dependabot girdisi. LSP kontrolü binary'yi artık çalıştırmıyor, PATH'te arıyor. Bu plugin'in davranışı değişmedi.

## 0.1.2

- `npm-dependencies.md`: kırmızı bir bulguyu düzelten aynı hat güvenlik yaması cooldown beklemez (ADR-0009 eki).
- `npm-dependencies.md`: TypeScript 6 `@types/*` paketlerini artık kendiliğinden yüklemiyor; `compilerOptions.types` gerekiyor (örnek repoda bulundu).
- Yeni `npm-dependencies.md` kuralı (`shared/rules/`): `package.json` ya da `.npmrc` düzenlenince yüklenir. 14 günlük cooldown'u, lockfile'ı ve npm 11'in `allowScripts` davranışını anlatır. npm 11.17'de bu alan yalnız uyarı veriyor; incelenmemiş install script'leri yine çalışıyor. Paket `npm approve-scripts`/`deny-scripts` ile incelenir. Aynı kural başka bir npm plugin'i tarafından kurulmuşsa ikinci kez kurulmaz.
- `setup`: Kurduğu CI script'leri artık yönetilen dosya ([ADR-0008](../../docs/adr/0008-yonetilen-dosyalar-ve-refresh.md)). `--refresh` onları elle değiştirilmemişlerse günceller; `--print <yol>` yazılacak içeriği gösterir; `--adopt <yol>` işaretsiz ya da elle değiştirilmiş bir kopyayı kullanıcı onayıyla değiştirir.
- `setup`: Kural dosyasında yalnız işaretteki sürüm değiştiyse dosya "outdated" sayılmıyor; `--refresh` gereksiz bir değişiklik üretmiyor.
- Ortak setup kodu stack sözleşmesi v2'ye geçti ([ADR-0010](../../docs/adr/0010-stack-sozlesmesi-v2.md)): `.csproj` manifestleri, `sdk`/`fileContains` koşulları, `{solution}` yer tutucusu ve `ci.yml` blokları.

## 0.1.1

- Setup, aynı formatter'ı başka bir plugin'in zaten çalıştırdığı dosyalar için tekrar eklemiyor; yalnız kapsanmayan uzantıları ekliyor. Önceden stack-node ve stack-web birlikte kurulunca prettier `.ts` dosyalarında iki kez çalışıyordu (ortak `stack-lib.mjs`).

## 0.1.0

- Stack sözleşmesinin ([ADR-0006](../../docs/adr/0006-stack-sozlesmesi.md)) ilk uygulaması.
- `stack.json`: `node`, `fastify` ve `nest` profilleri paket başına algılanır. Kurallar yalnız backend paketlerinin yollarına yüklenir; frontend paketleri ve workspace kökü hariç tutulur.
- Kurallar: `node.md`, `fastify.md`, `nest.md`.
- Formatter kaydı (prettier ya da biome), verify adımları (`typecheck`, `lint`, `test:unit`, `test`, `build`), 14 gün cooldown'lu `npm` Dependabot girdisi, `typescript-language-server` LSP'si.
- Skill'ler: `setup`, `scaffold` (Fastify referans servisiyle), `upgrade-deps` (`npm-cooldown.mjs` ile), `test`, `api-endpoint`.

## 0.0.1

- İskelet oluşturuldu (Faz 0).
