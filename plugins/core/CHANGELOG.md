# Changelog — core

## 1.1.0

- **One-step setup.** `/core:init` detects the stack, shows a plugin checklist, installs the chosen plugins at project scope (with `governance` and `work-github`), writes the scaffold, runs every plugin's setup script straight from its installed copy and runs `verify --fast`. `--yes` takes the detected plugins; `--plugins a,b` takes exactly those. It also sets `core.hooksPath` ([ADR-0013](../../docs/adr/0013-one-step-onboarding.md)).
- **New skill `/core:plugins`:** add or remove plugins later. Removing one takes back its rules, `ci.yml` blocks, verify and format entries and unedited managed files; edited files and Dependabot entries stay and are reported. `core`, `governance` and `work-github` cannot be removed.
- **Dormant outside set-up projects.** core can be installed for the user. Its hooks act only below a folder that holds `.claude/ideal-agentic-env.json`; elsewhere they do nothing and the session gets a one-line hint instead of the constitution. Bad hook input still fails closed. Not breaking: hooks only stop blocking in projects that never opted in.
- `scaffold.mjs`: an explicit empty `--stacks` list means no optional plugins (it fell back to detection).
- Docs in English.

## 1.0.0

- Stabil: 1.x içinde kırıcı değişiklik yok; kırıcı her değişiklik major sürüm ve göç notuyla gelir ([ADR-0012](../../docs/adr/0012-v1-surum-sozu.md)). 0.4.0'ın üzerine yalnız bu bölümdeki maddeleri getirir.
- `init`: Java verify adımları `stack-java-spring` ile aynı ad ve komutları kullanıyor (`maven compile`, `maven verify`, `gradle compile`, `gradle check`). `ci.yml`'e artık Java toolchain adımı yazmıyor; `/stack-java-spring:setup`, build'in Java sürümüyle `setup-java`'yı `steps` bölgesine ekliyor.
- `init`: `stack-python` ve `data-nosql` katalogdan çıktı; init onları artık `enabledPlugins`'e yazmıyor. Python projelerinde verify adımları (ruff, pytest) ve `setup-python` CI adımı kalıyor.

## 0.4.0

- `init`: `.editorconfig` şablonu EF Core migration'larını (`**/Migrations/*.cs`) üretilmiş kod olarak işaretliyor. EF bu dosyaları BOM'la yazdığı için `dotnet format --verify-no-changes` her yeni migration'da kırılıyordu.
- `shell-guard`: Proje config'indeki `guardedCommands` listesini de uygular. Her girdi bir komut parçasına (`program arg arg`) büyük/küçük harfe duyarsız eşleşen bir regex, bir karar (`ask` ya da `deny`) ve bir gerekçe taşır. devops ve bulut plugin'lerinin setup'ı kendi tehlikeli komutlarını buraya ekler. Geçersiz bir desen yok sayılır; yerleşik kuralları asla zayıflatmaz.
- `init`: `ci.yml`'e artık .NET toolchain adımı yazmıyor. `/stack-dotnet:setup` bu adımı NuGet cache'iyle birlikte `steps` bölgesine kendisi ekliyor; iki adım çakışmıyor.
- `init`: `ci.yml` şablonunun verify job'ında üç işaretli bölge var: `services`, `steps` ve `after`. Stack plugin'lerinin setup'ı bunlara kendi bloğunu yazar ve `--refresh` ile günceller; bölge dışı projenindir ([ADR-0010](../../docs/adr/0010-stack-sozlesmesi-v2.md)). Bölgeleri olmayan eski bir `ci.yml`'e stack setup'ları bölgeleri kendisi ekler.

## 0.3.1

- `init`: Stack algılama artık her `package.json`'a bakıyor. Önceden yalnız kökteki dosya okunuyordu; workspace monorepo'larında `apps/*` ve `packages/*` görülmüyor, Next/Drizzle/Postgres kaçıyor ve yalnız `stack-node` öneriliyordu. Örnek uygulamada gerçek bir oturumda bulundu.
- `verify-gate`: Bir deneme, engellenen bir önceki denemeyle birebir aynı çıktıyla kırmızıya dönerse durmaya izin verir ve uyarı gösterir. Bu genelde görevle ilgisiz, önceden var olan bir hatadır. Önceden aynı hata için üç tur harcanıyordu; değişen hatalarda üç deneme hakkı aynen duruyor.

## 0.3.0

- Config'e `migrationsMutable` listesi eklendi. Migration klasörlerinde kendi aracının güncellediği dosyalar (Drizzle `meta/_journal.json`, Prisma `migration_lock.toml`, EF Core `*ModelSnapshot.cs`, Flyway `R__*.sql`) merge edildikten sonra da değiştirilebilir. Proje kendi listesini ekleyebilir. data-sql'in CI kontrolü aynı listeyi kullanır ([ADR-0007](../../docs/adr/0007-migration-guvenligi.md)).
- Glob eşleştirici `{a,b}` alternasyonunu destekliyor (`format` girdileri için, ör. `**/*.{ts,tsx}`).
- `init`: Devir adımı, etkin her stack, data ve design plugin'i için `/<plugin>:setup` çalıştırmayı söylüyor ([ADR-0006](../../docs/adr/0006-stack-sozlesmesi.md)).

## 0.2.1

- `shell-guard`: Korumalı yollara ve merge edilmiş migration'lara shell üzerinden yazmayı da yakalar. Önceden yalnız Edit/Write araçları denetleniyordu; `cat <<EOF > .github/...`, `echo >> CLAUDE.md`, `tee`, `sed -i`, `perl -i`, `cp`/`mv`/`install` hedefi, `rm`/`truncate`/`touch`, `dd of=` ve PowerShell `Set-Content`/`Remove-Item` gibi komutlar edit-guard'ı atlatabiliyordu. Artık aynı kurallar uygulanıyor: korumalı yol için onay, merge edilmiş migration için ret. Dizin hedefleri (`rm -rf .github`) de tanınır. Gerçek bir Claude Code oturumunda (dogfood) bulundu.
- `init`: Onay verilemeyen (etkileşimsiz) oturumda korumalı dosyayı başka yoldan yazmaz, içeriği kullanıcıya gösterip durur. `--full`'un önce `fast` adımlarını çalıştırdığı açıkça yazıldı.
- `ci.yml` şablonundaki action pin'leri bu reponun workflow'larıyla hizalandı (`actions/checkout` v7.0.1, `actions/setup-node` v7.1.0). Bundan sonra `npm run validate` sapmayı hata sayar.

## 0.2.0

- `shell-guard`: Korumalı bir branch'e (`main`, `master`, `develop`, `release/*`, `prod*`) yapılan doğrudan push için onay ister.
  - Açık refspec'ler (`git push origin main`, `HEAD:main`) ve mevcut branch'in örtük push'u (`git push`, `git push origin HEAD`) bu kurala girer.
  - Korumalı branch'e örtük force push artık reddedilir.
  - `git push --all` ve `+refspec` için de onay ister.
  - Gerekçe: Free planda branch protection yok ([ADR-0003](../../docs/adr/0003-free-planda-yasa-katmani.md)).
- Korumalı yollar genişledi: `.github/**`'ın tamamı (önceden yalnız `workflows/**` ve `CODEOWNERS`) ve `.githooks/**`.
- `init`:
  - Yeni `.githooks/pre-push` şablonu korumalı branch'e doğrudan push'u durdurur. `init` mevcut klon için `core.hooksPath` ayarını yapar.
  - CODEOWNERS'a `.githooks/` eklendi.
  - `ci.yml` şablonundaki ve stack'e göre eklenen setup action'ları artık tam commit SHA'sına pinli (Semgrep `github-actions-mutable-action-tag`).
  - `format-dispatch` ve `scripts/verify.mjs` şablonundaki `shell: true` için gerekçeli `nosemgrep` eklendi. Komutlar korumalı proje config'inden geliyor ve Windows'ta `.cmd` çalıştırmak için shell gerekiyor.
  - Devir adımında `/governance:setup` ve `/work-github:setup` önerilir. Branch protection önerisi artık planın bu özelliği sunup sunmadığına bakıyor.
- `plan`: Açıklamadaki `#N`, YAML'da yorum olarak okunuyor ve açıklamanın geri kalanını kesiyordu; düzeltildi. Issue sahiplenme work-github'ın `take-issue` skill'ine devredildi.
- `pre-pr`: Uygun değişikliklerde governance'ın `compliance-auditor` agent'ını çağırır. PR'ı work-github'ın `pr` skill'i açar.
- Hook kütüphanesi (`io`, `paths`, `plugin`, `state`) artık repo kökündeki `shared/hooks-lib/`'den kopyalanıyor. Mesaj öneki plugin adını `plugin.json`'dan alıyor.

## 0.1.0

- Mühendislik anayasası (`constitution.md`): her oturumun başında SessionStart hook'u ile enjekte edilir.
- Güvenlik hook'ları. Hepsi fail-closed, exec-form Node ve Windows/macOS/Linux uyumlu:
  - `shell-guard`: tehlikeli Bash ve PowerShell komutlarını yakalar, secret dosya okumayı engeller.
  - `read-guard`: secret dosyaları Read ve Grep araçlarına kapatır.
  - `edit-guard`: korumalı yollara yazmadan önce onay ister, merge edilmiş migration'ı değiştirmeyi yasaklar, yazılan içerikte secret arar.
- Kolaylık hook'ları. Hepsi fail-open:
  - `format-dispatch`: düzenlenen dosyaya projenin formatter'ını çalıştırır.
  - `audit-trail`: yapılan işlemleri içerik saklamadan yerel bir iz dosyasına yazar.
  - `verify-gate`: oturumda değişiklik varsa iş bitmeden önce `verify --fast` yeşil olmalı.
  - `session-context`: oturum başında proje durumunu özetler.
- Skill'ler:
  - `init`: deterministik scaffold, stack algılama ve proje şablonu.
  - `plan`, `implement`, `verify`, `pre-pr`.
  - `adr`, `guardrail`, `env-request`.
- Agent'lar: `architect`, `reviewer`, `security-auditor`, `test-engineer`.

## 0.0.1

- İskelet oluşturuldu (Faz 0).
