# Changelog — stack-java-spring

## 1.0.0

- İlk sürüm (Faz 5). Stack sözleşmesi v2'ye JVM manifestleri eklendi: `pom.xml`, `build.gradle(.kts)` ve `gradle/libs.versions.toml`. Bağımlılıklar `groupId:artifactId` olarak okunuyor ve yeni `dependencyPrefixes` koşuluyla algılanıyor.
- Kurallar: `java.md`, `spring-boot.md`, `modulith.md`, `testing.md`.
- `setup`: wrapper'la verify adımları (platforma göre `posix`/`win32`), Spotless varsa format kontrolü, `ci.yml`'e build'in Java sürümüyle `setup-java` adımı, `maven` ya da `gradle` Dependabot girdisi, `jdtls` kontrolü.
- Skill'ler: `scaffold`, `test`, `new-module`, `upgrade-deps` (Maven Central'a karşı 14 günlük cooldown).
- README: Spring Boot projelerinde lisans kapısında duran Logback ve Jakarta Annotations için proje başına istisna örneği.
- Kanıt: `fixtures/spring-postgres` (Spring Boot 4.1, Spring Modulith 2.1, Flyway, Testcontainers PostgreSQL). Gradle deneysel.

## 0.0.1

- İskelet oluşturuldu (Faz 0).
