# stack-dotnet

> **Durum:** Stabil, 1.0.0.

.NET / C# backend'leri için stack plugin'i: C# dili ve build disiplini, ASP.NET Core ve testler. EF Core migration'ları ve veritabanı kuralları `data-sql`'de.

## Ne yapar?

- **Kurallar (path-scoped):** `/stack-dotnet:setup`, algıladığı projeler için kuralları `.claude/rules/stack-dotnet/` altına yazar.
  - `dotnet.md` (bütün C# dosyaları ve proje dosyaları): nullable ve uyarıların hata sayılması, async disiplini, `TimeProvider`, `decimal`, başlangıçta options doğrulaması, yapılandırılmış log, kültüre bağlı string karşılaştırması (`tr-TR`'de `"FILE".ToLower()` `"fıle"` olur).
  - `aspnetcore.md` (`Microsoft.NET.Sdk.Web` projeleri): ince handler'lar, sınırda doğrulama (.NET 10 `AddValidation()`), ProblemDetails, varsayılan yetkilendirme, rate limit, CORS, forwarded headers, health check'ler, OpenTelemetry.
  - `testing.md` (test projeleri): gerçek veritabanına karşı `WebApplicationFactory`, EF Core InMemory yok, `FakeTimeProvider`, sentetik veri.
- **`Directory.Build.props`:** repoda yoksa oluşturulur. Nullable, uyarılar hata, `latest-recommended` analyzer'lar, her projede `packages.lock.json`, CI'da kilitli restore. NuGet audit uyarı verir ama build'i kırmaz; neyin kırmızı olacağına governance'ın bağımlılık kapısı karar verir ([ADR-0009](../../docs/adr/0009-bagimlilik-kapisi-onem-politikasi.md)).
- **Formatter:** `.config/dotnet-tools.json` CSharpier içeriyorsa CSharpier, yoksa `dotnet format whitespace --folder` (dosya başına ~0,6 sn).
- **Verify:** `fast`'te `dotnet build` ve `dotnet format --verify-no-changes`, `full`'da `dotnet test`. Hepsi kökteki solution dosyasıyla çalışır (`.slnx` önce). Solution yoksa adımlar eklenmez ve setup bunu not olarak söyler.
- **CI:** `ci.yml`'e `setup-dotnet` adımı (varsa `global.json`'dan, NuGet cache'iyle) ([ADR-0010](../../docs/adr/0010-stack-sozlesmesi-v2.md)).
- **Dependabot:** `nuget` ekosistemi, 14 gün cooldown.
- **LSP:** `csharp-ls`. Gerçek oturumda .NET 10 ile denendi (2.1.326): `documentSymbol` ve `hover` çalışıyor. Binary'yi plugin kurmaz; setup yoksa kurulum komutunu söyler.

## Skill'ler

| Skill | Nasıl çağrılır | Ne yapar |
| --- | --- | --- |
| `setup` | `/stack-dotnet:setup` | Sözleşmeyi projeye add-only uygular. |
| `scaffold` | `/stack-dotnet:scaffold` | SDK şablonlarıyla .NET 10 Web API + xUnit test projesi kurar ve sertleştirir. |
| `upgrade-deps` | `/stack-dotnet:upgrade-deps` | NuGet paketlerini 14 gün cooldown'la, major'ları tek tek yükseltir (`nuget-cooldown.mjs`). |
| `test` | Otomatik | xUnit birim testleri ve `WebApplicationFactory` entegrasyon testleri. |
| `api-endpoint` | Otomatik | Endpoint'i DTO, doğrulama, yetki, ProblemDetails, audit log ve testlerle birlikte ekler. |

## Kurulum

Önce `/core:init` ve `/governance:setup`. EF Core ya da bir veritabanı varsa `/data-sql:setup`.

```bash
claude plugin install stack-dotnet@ideal-agentic-env --scope project
```

Sonra projede `/stack-dotnet:setup` çalıştır.
