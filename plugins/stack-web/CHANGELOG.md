# Changelog — stack-web

## 1.0.0

- Stabil: 1.x içinde kırıcı değişiklik yok; kırıcı her değişiklik major sürüm ve göç notuyla gelir ([ADR-0012](../../docs/adr/0012-v1-surum-sozu.md)). 0.2.0'ın üzerine yalnız bu bölümdeki maddeleri getirir.
- Ortak setup kütüphanesi (`stack-lib.mjs`) güncellendi: Maven/Gradle manifestleri, `dependencyPrefixes` koşulu, platforma göre verify komutu, koşullu Dependabot girdisi. LSP kontrolü binary'yi artık çalıştırmıyor, PATH'te arıyor. Bu plugin'in davranışı değişmedi.

## 0.2.0

- `npm-dependencies.md`: kırmızı bir bulguyu düzelten aynı hat güvenlik yaması cooldown beklemez (ADR-0009 eki).
- `npm-dependencies.md`: TypeScript 6 `@types/*` paketlerini artık kendiliğinden yüklemiyor; `compilerOptions.types` gerekiyor (örnek repoda bulundu).
- **Vue ve Nuxt profilleri.** `vue.md` (Vue ya da Nuxt paketi) ve `nuxt.md` (Nuxt paketi) kuralları; `web.md` artık `.vue` dosyalarına da yüklenir. Prettier `.vue` dosyalarını da biçimlendirir. `scaffold` Vue 3 + Vite ve Nuxt kurar, `test` Vue Testing Library ve `@nuxt/test-utils` desenlerini anlatır.
- **`.vue` için kod zekâsı:** `.lsp.json`, `.vue` dosyalarını `typescript-language-server`'a verir ve projenin `@vue/typescript-plugin` paketini yükler. `vue-language-server` tek başına Claude Code'da her istekte zaman aşımına düştüğü için kullanılmıyor. Plugin paketi eksik bir Vue projesinde setup bunu not olarak söyler (sözleşmede yeni `hints` alanı).
- **TypeScript 6.0.x:** `npm-dependencies.md` ve `scaffold`, `typescript`'in 6.0.x'te tutulmasını söyler. TypeScript 7 native derleyici; `tsserver` ve JS API'si yok; `typescript-eslint` `<6.1.0`'ı destekliyor.
- Yeni `npm-dependencies.md` kuralı (`shared/rules/`): `package.json` ya da `.npmrc` düzenlenince yüklenir. 14 günlük cooldown'u, lockfile'ı ve npm 11'in `allowScripts` davranışını anlatır. npm 11.17'de bu alan yalnız uyarı veriyor; incelenmemiş install script'leri yine çalışıyor. Paket `npm approve-scripts`/`deny-scripts` ile incelenir. Aynı kural başka bir npm plugin'i tarafından kurulmuşsa ikinci kez kurulmaz.
- `setup`: Kurduğu CI script'leri artık yönetilen dosya ([ADR-0008](../../docs/adr/0008-yonetilen-dosyalar-ve-refresh.md)). `--refresh` onları elle değiştirilmemişlerse günceller; `--print <yol>` yazılacak içeriği gösterir; `--adopt <yol>` işaretsiz ya da elle değiştirilmiş bir kopyayı kullanıcı onayıyla değiştirir.
- `setup`: Kural dosyasında yalnız işaretteki sürüm değiştiyse dosya "outdated" sayılmıyor; `--refresh` gereksiz bir değişiklik üretmiyor.
- Ortak setup kodu stack sözleşmesi v2'ye geçti ([ADR-0010](../../docs/adr/0010-stack-sozlesmesi-v2.md)): `.csproj` manifestleri, `sdk`/`fileContains` koşulları, `{solution}` yer tutucusu ve `ci.yml` blokları.
- `setup`: `@playwright/test` olan bir pakette `ci.yml`'e, `verify --full`'dan önce tarayıcıyı kuran adımı ekler (sürüm lockfile'dan gelir).

## 0.1.1

- Setup, aynı formatter'ı başka bir plugin'in zaten çalıştırdığı dosyalar için tekrar eklemiyor; yalnız kapsanmayan uzantıları ekliyor. Önceden stack-node ve stack-web birlikte kurulunca prettier `.ts` dosyalarında iki kez çalışıyordu (ortak `stack-lib.mjs`).

## 0.1.0

- Stack sözleşmesi ([ADR-0006](../../docs/adr/0006-stack-sozlesmesi.md)): `web`, `react` ve `next` profilleri paket bazında algılanır. React Native paketleri hariç tutulur.
- Kurallar: `web.md`, `react.md`, `next.md`.
- `bundle-budget.mjs` (projeye `.github/scripts/` altında kurulur, `verify.full`'da build'den sonra çalışır) ve `web.budget` varsayılanı (en büyük chunk 200 KB, toplam 600 KB, gzip).
- Formatter kaydı, verify adımları (`typecheck`, `lint`, `test:unit`, `test`, `build`, `test:e2e`), 14 gün cooldown'lu `npm` Dependabot girdisi, `typescript-language-server`.
- Skill'ler: `setup`, `scaffold`, `upgrade-deps`, `test`, `perf-budget`.

## 0.0.1

- İskelet oluşturuldu (Faz 0).
