# stack-java-spring

> **Durum:** Stabil, 1.0.0. Maven ile kanıtlandı: `fixtures/spring-postgres` fixture CI'ında `verify --full` yeşil. Gradle desteği **deneysel**: algılama ve verify adımları birim testli, ama gerçek bir projede denenmedi.

Java / Spring Boot backend'leri için stack plugin'i: Java dili ve build disiplini, Spring Boot, Spring Modulith sınırları ve testler. Flyway migration'ları ve SQL kuralları `data-sql`'de.

## Ne yapar?

- **Kurallar (path-scoped):** `/stack-java-spring:setup`, algıladığı modüller için kuralları `.claude/rules/stack-java-spring/` altına yazar.
  - `java.md` (bütün Java ve build dosyaları): wrapper ve BOM disiplini, `Optional` ve `record`, `Clock`, `BigDecimal`, yapılandırılmış log, locale'e bağlı string işlemleri (`tr-TR`'de `"FILE".toLowerCase()` `"fıle"` olur).
  - `spring-boot.md` (Spring Boot modülleri): constructor injection, doğrulanan `@ConfigurationProperties`, DTO record'ları, ProblemDetails, `@Transactional` tuzakları, `ddl-auto=validate`, varsayılan olarak her şeyi reddeden Spring Security, Actuator.
  - `modulith.md` (Spring Modulith kullanılıyorsa): modül API'si ve iç paketler, `ApplicationModules.verify()`, olaylarla iletişim, her modülün kendi tabloları.
  - `testing.md` (test kaynakları): Testcontainers ile `@ServiceConnection`, H2 yok, slice testleri, ArchUnit, sabit `Clock`.
- **Verify:** kökteki wrapper'la çalışır (Windows'ta `mvnw.cmd`). Maven'da `fast`'te `test-compile`, pom'da Spotless varsa `spotless:check`; `full`'da `verify`. Gradle'da `testClasses`, `spotlessCheck` ve `check`. `core:init` aynı adları kullanır; adımlar iki kez eklenmez.
- **Formatter:** düzenleme başına çalışmaz, çünkü her dosya için JVM başlatmak çok yavaş. Format kontrolü Spotless ile verify'da yapılır. Spotless yoksa setup bunu not olarak söyler.
- **CI:** `ci.yml`'e `setup-java` adımı: Temurin, build'in istediği Java sürümü (`java.version`, `maven.compiler.release`, Gradle toolchain ya da `.java-version`), Maven ya da Gradle cache'i. Testcontainers runner'ın Docker'ını kullanır.
- **Dependabot:** `maven` ya da `gradle` ekosistemi, 14 gün cooldown.
- **LSP:** `jdtls`. Binary'yi plugin kurmaz; setup yoksa kurulum komutunu söyler. Gerçek bir Claude oturumunda denenmedi.

## Lisans kapısı (governance)

governance'ın bağımlılık kapısı Maven projesinde çözülmüş ağacı tarar (compile ve runtime, test hariç). Hemen her Spring Boot projesinde iki bağımlılık varsayılan allowlist'in dışında kalır ve kapıyı kırmızıya çevirir:

- Logback (`logback-classic`, `logback-core`): EPL-2.0 ya da LGPL-2.1,
- `jakarta.annotation-api`: EPL-2.0 ya da GPL-2.0 Classpath Exception.

Varsayılan allowlist'e eklenmediler (repo sahibinin kararı, 2026-11-24). Kabul etmek **o projenin sahibinin** kararıdır. Kabul edilirse `osv-scanner.toml`'a gerekçesi ve bitiş tarihi olan bir girdi yazılır, incelenen bir PR'da; açık taraması devam eder. Örnek: [`fixtures/spring-postgres/osv-scanner.toml`](../../fixtures/spring-postgres/osv-scanner.toml).

## Skill'ler

| Skill | Nasıl çağrılır | Ne yapar |
| --- | --- | --- |
| `setup` | `/stack-java-spring:setup` | Sözleşmeyi projeye add-only uygular. |
| `scaffold` | `/stack-java-spring:scaffold` | Spring Modulith'li, Flyway ve Testcontainers'lı yeni bir Spring Boot servisi kurar. |
| `upgrade-deps` | `/stack-java-spring:upgrade-deps` | Önce BOM'ları, sonra diğerlerini 14 gün cooldown'la yükseltir (`maven-cooldown.mjs`, Maven Central yayın tarihleri). |
| `test` | Otomatik | JUnit 5, slice ve Testcontainers entegrasyon testleri, Modulith ve ArchUnit. |
| `new-module` | Otomatik | Yeni bir Spring Modulith modülünü API'si, migration'ı, olayları ve testleriyle ekler. |

## Kurulum

Önce `/core:init` ve `/governance:setup`. Veritabanı varsa `/data-sql:setup`.

```bash
claude plugin install stack-java-spring@ideal-agentic-env --scope project
```

Sonra projede `/stack-java-spring:setup` çalıştır.
