# Changelog — stack-dotnet

## 1.0.1

- CI fragment: `actions/setup-dotnet` v6.1.0 (was v4.3.1), Node.js 24 (self-hosted runners need v2.327.1 or newer). The inputs used (`dotnet-version`, `global-json-file`, `cache`, `cache-dependency-path`) are unchanged. Run `/stack-dotnet:setup --refresh` to update a project's `ci.yml` block.

## 1.0.0

- Stabil: 1.x içinde kırıcı değişiklik yok; kırıcı her değişiklik major sürüm ve göç notuyla gelir ([ADR-0012](../../docs/adr/0012-v1-surum-sozu.md)). 0.1.0'ın üzerine yalnız bu bölümdeki maddeleri getirir.
- Ortak setup kütüphanesi (`stack-lib.mjs`) güncellendi: Maven/Gradle manifestleri, `dependencyPrefixes` koşulu, platforma göre verify komutu, koşullu Dependabot girdisi. LSP kontrolü binary'yi artık çalıştırmıyor, PATH'te arıyor. Bu plugin'in davranışı değişmedi.

## 0.1.0

- `dotnet.md`: kırmızı bir bulguyu düzelten aynı hat güvenlik yaması cooldown beklemez (ADR-0009 eki).
- İlk sürüm. Stack sözleşmesi v2 üzerine kuruldu ([ADR-0010](../../docs/adr/0010-stack-sozlesmesi-v2.md)): `.csproj` manifestleri, `Microsoft.NET.Sdk.Web` algılaması ve `{solution}` yer tutucusu.
- Kurallar: `dotnet.md`, `aspnetcore.md`, `testing.md`.
- `setup`: formatter (CSharpier ya da `dotnet format whitespace`), build/format/test verify adımları, `Directory.Build.props` şablonu, `ci.yml`'e `setup-dotnet` adımı, `nuget` Dependabot girdisi, `csharp-ls` kontrolü.
- Skill'ler: `scaffold`, `test`, `api-endpoint`, `upgrade-deps` (NuGet registration API'siyle 14 günlük cooldown).
- `Directory.Build.props` şablonu `*.Tests` projelerinde CA1707'yi kapatıyor: `testing.md` test adlarını cümle gibi (`Returns_404_when_...`) yazdırıyor.
- `aspnetcore.md` ve scaffold referansı: `MapIdentityApi` kullanan bir uygulamada fallback policy `/login`'i de kilitliyor; grup başına `RequireAuthorization` öneriliyor (örnek repoda bulundu).
- İpucu: EF Core migration'ları `.editorconfig`'te üretilmiş kod olarak işaretli değilse setup bunu söyler.

## 0.0.1

- İskelet oluşturuldu (Faz 0).
