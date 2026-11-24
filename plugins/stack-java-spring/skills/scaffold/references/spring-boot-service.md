# Spring Boot service reference (stack-java-spring)

The marketplace's `fixtures/spring-postgres` is a working, CI-tested example of this layout.

## Layout

```
pom.xml                      parent spring-boot-starter-parent; Modulith and Testcontainers BOMs in dependencyManagement
mvnw, mvnw.cmd, .mvn/wrapper/
src/main/java/com/company/product/
  Application.java           @SpringBootApplication + @ConfigurationPropertiesScan
  catalog/                   a module: its API at the top level
    Book.java                record (DTO)
    CatalogService.java      public API of the module
    internal/                repositories, entities, controllers: not visible to other modules
  lending/
    LoanCreated.java         published event record
    internal/...
src/main/resources/
  application.yml
  db/migration/V1__catalog.sql
src/test/java/com/company/product/
  ModularityTests.java       ApplicationModules.of(Application.class).verify()
  TestcontainersConfiguration.java
  catalog/CatalogApiTests.java
```

## Code patterns

**Configuration properties, validated at startup:**

```java
@ConfigurationProperties("product.lending")
@Validated
public record LendingProperties(@NotNull @DurationMin(days = 1) Duration loanPeriod, @Positive int maxLoans) {}
```

**ProblemDetails with a stable type:**

```java
@RestControllerAdvice
class ApiErrors {
  @ExceptionHandler(BookNotFound.class)
  ProblemDetail notFound(BookNotFound e) {
    var p = ProblemDetail.forStatus(HttpStatus.NOT_FOUND);
    p.setType(URI.create("urn:problem:book-not-found"));
    p.setTitle("Book not found");
    return p;
  }
}
```

**application.yml defaults:**

```yaml
spring:
  application.name: product
  jpa.open-in-view: false            # when JPA is used
  jpa.hibernate.ddl-auto: validate
  mvc.problemdetails.enabled: true
  threads.virtual.enabled: true
server.shutdown: graceful
management:
  endpoints.web.exposure.include: health,info
  endpoint.health.probes.enabled: true
```

The datasource URL, user and password come from environment variables (`SPRING_DATASOURCE_URL` …), never from the file.

**Testcontainers, one container per run:**

```java
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {
  @Bean
  @ServiceConnection
  PostgreSQLContainer postgres() {
    return new PostgreSQLContainer(DockerImageName.parse("postgres:17-alpine"));
  }
}
```

Use it with `@SpringBootTest @Import(TestcontainersConfiguration.class)`. Pin the image to the major the project runs in production.

**Architecture test:**

```java
class ModularityTests {
  @Test
  void modulesRespectTheirBoundaries() {
    ApplicationModules.of(Application.class).verify();
  }
}
```

## Security

When the service has users, add `spring-boot-starter-security` with a `SecurityFilterChain` bean that denies by default and lists every public matcher (health included). Keep CSRF on for cookie sessions.
