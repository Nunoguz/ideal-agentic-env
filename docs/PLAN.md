# ideal-agentic-env — Nihai Plan (taslak v0.1)

> Durum: **Onaylandı. Faz 0–4 tamam; sırada Faz 5.** Son güncelleme: 2026-11-23.
> Bu doküman insan içindir (Türkçe). Claude'un okuyacağı skill, rule, agent ve hook metinleri İngilizce yazılır.

---

## 1. Alınan kararlar

| Konu | Karar | Sonucu |
| --- | --- | --- |
| Dağıtım | **Private GitHub reposunda Claude Code plugin marketplace** | Ücretsiz. Takım `/plugin marketplace add <org>/ideal-agentic-env` ile ekler; projeler kurulacak plugin'leri kendi `settings.json`'unda bildirir. |
| Araç | **Yalnız Claude Code** | Eski yapıdaki çoklu araç üretimi (`sync_agent_docs.py`, parity check, copilot dosyası) tamamen kalkar. |
| Stack | .NET/C#, Java/Spring, JS, TS/React/Next, Python, Mobil, SQL, NoSQL | Her biri **ayrı plugin**. Proje yalnız ihtiyacı olanı kurar, context şişmez. |
| Ölçek | Küçük takım, ama **KVKK / SOC 2 / ISO 27001 her projede zorunlu** | Governance plugin'i her projede zorunlu kurulur. |
| Claude planı | Bireysel Pro/Max | Managed settings yok → politikalar **proje ayarları + hook + git hook + CI + branch protection** ile uygulanır. |
| GitHub planı | **Free** (private repo) | Branch protection, CodeQL ve dependency-review yok. Yerlerine telafi kontrolleri kullanılıyor: pre-push hook, `shell-guard` onayı, `change-audit` workflow'u ve açık kaynak tarayıcılar ([ADR-0003](adr/0003-free-planda-yasa-katmani.md), [ADR-0004](adr/0004-ci-guvenlik-araclari.md)). |
| İş takibi | GitHub Issues/Projects **ve** repoda yerel PBI dosyaları | İkisi aynı şemayı kullanır; aynı skill ikisiyle de çalışır. |
| Deploy | Self-hosted / VPS / K8s; diğerleri sonradan kolayca eklenebilmeli | `devops-selfhosted` plugin'i + bulut sağlayıcı eklemek için şablon ve rehber. |
| Otonomi | **Auto mode + hook korkulukları** | Rutin iş sormadan yürür; tehlikeli işlemler hook'la deterministik engellenir; push/PR/merge/deploy her zaman insan onaylı. |
| UI/UX | **Proje başına tasarım dili** | Her projede önce design direction + token sistemi; UI işleri ona bağlı; görsel ve erişilebilirlik doğrulaması zorunlu. |
| Dil | Makineye İngilizce, insana Türkçe | — |

---

## 2. Temel ilke: "Tavsiye, Kural, Yasa" katmanları

Eski yapının en büyük zaafı: kuralların neredeyse tamamı **metindi** (CLAUDE.md, playbook). Model metni her zaman uygulamaz. Yeni yapıda her kural, kırıldığında ne kadar zarar verdiğine göre doğru katmana konur:

| Katman | Mekanizma | Ne konur | Atlatılabilir mi? |
| --- | --- | --- | --- |
| **Tavsiye** | CLAUDE.md, `.claude/rules/*.md`, skill metni | Stil, tercih, mimari yönelim, "nasıl yapılır" | Evet (model unutabilir) |
| **Kural** | Claude Code hook'ları (PreToolUse, PostToolUse, Stop, SessionStart) | Secret okuma yasağı, tehlikeli komut, korumalı dosya, format, "test geçmeden bitti deme" | Yalnız Claude için bağlayıcı |
| **Yasa** | Git hook + **CI** + branch protection + CODEOWNERS | Secret tarama, SAST, bağımlılık açığı, test, migration kuralları, lisans | **Hayır** — insan için de geçerli |

**Kural:** "Asla olmamalı" denen her şey en az bir **Yasa** katmanında da bulunmalı. CLAUDE.md'de yazıp CI'da kontrol etmediğimiz bir "bozulmaz kural" olamaz.

**Tek doğrulama komutu:** Her projede `scripts/verify` (`--fast` / `--full`). Claude'un Stop hook'u, geliştiricinin terminali ve CI **aynı komutu** çağırır. Eski `verify.sh` fikrinin genelleştirilmiş hali.

---

## 3. Repo yapısı

```
ideal-agentic-env/
├── .claude-plugin/marketplace.json      # marketplace kataloğu
├── plugins/
│   ├── core/                            # ZORUNLU — anayasa, hook'lar, iş akışı, ana agent'lar
│   ├── governance/                      # ZORUNLU — KVKK/GDPR, SOC 2, ISO 27001, audit
│   ├── work-github/                     # GitHub Issues/Projects + yerel PBI
│   ├── design/                          # tasarım dili, UI kalite, erişilebilirlik, görsel doğrulama
│   ├── devops-selfhosted/               # Docker, Compose, K8s/Helm, gözlemlenebilirlik, yedek
│   ├── data-sql/                        # PostgreSQL, SQL Server, MySQL
│   ├── data-nosql/                      # MongoDB, Redis, (Dynamo/Cosmos şablonu)
│   ├── stack-dotnet/
│   ├── stack-java-spring/
│   ├── stack-web/                       # TS/JS frontend: React, Next
│   ├── stack-node/                      # TS/JS backend: Node, Nest, Fastify
│   ├── stack-python/
│   └── stack-mobile/                    # iOS (Swift), Android (Kotlin), React Native
├── templates/
│   └── plugin-skeleton/                 # yeni plugin (ör. AWS/Azure/GCP) için başlangıç
│                                        # (proje şablonu core'un içinde: plugins/core/skills/init/templates/
│                                        #  — kurulan plugin yalnız kendi klasörünü taşır)
├── evals/                               # plugin başına skill tetiklenme ve davranış testleri
├── docs/                                # Türkçe insan dokümanları + ADR'ler
├── .github/workflows/                   # plugin doğrulama, hook testleri, eval, release
├── CODEOWNERS
└── CLAUDE.md                            # BU repoyu geliştirmek için kurallar
```

Her plugin'in iç yapısı aynı:

```
plugins/<name>/
├── .claude-plugin/plugin.json           # ad, sürüm (semver), açıklama
├── skills/<skill>/SKILL.md (+ references/, scripts/)
├── agents/<agent>.md
├── hooks/hooks.json + scripts/
├── rules/                               # init'in projeye kopyaladığı path-scoped kurallar
├── .lsp.json / .mcp.json                # gerekiyorsa
├── README.md                            # Türkçe: ne yapar, ne zaman kurulur
└── CHANGELOG.md
```

---

## 4. Plugin'lerin içeriği

### 4.1 `core` (zorunlu)

**Anayasa (Engineering Constitution).** ~60 satırlık, değişmez mühendislik yasaları. SessionStart hook'u ile her oturuma enjekte edilir. Böylece merkezden sürümlenir, her projeye kopyalanmaz, güncellenince herkese yayılır. Başlıklar:
- Doğruluk: uydurma yok, emin değilsen "bulamadım, şunu varsaydım" de; test geçmeden "bitti" yok.
- Kapsam: istenmeyeni yapma, spekülatif soyutlama yok, TODO bırakıp geçme yok.
- Güvenlik: secret'a dokunma, PII'yi log/trace/fixture'a koyma, kullanıcı girdisine güvenme.
- Veri: geri alınamaz işlem (migration, delete, force push) yalnız açık onayla.
- İletişim: büyük değişiklikten önce kısa plan, sonra neyi neden değiştirdiğini söyle.

**Hook'lar** (zero-dependency Node.js scriptleri, exec-form, Windows/macOS/Linux; birim testli — [ADR-0002](adr/0002-cok-platformlu-hook-tasarimi.md)):

| Olay | Hook | Davranış |
| --- | --- | --- |
| SessionStart | `context-inject` | Anayasa + branch, kirli dosyalar, aktif plan/issue özeti |
| PreToolUse (Bash) | `command-guard` | `rm -rf` kökleri, `git push --force` ana dallara, `reset --hard`, `DROP/TRUNCATE`, `kubectl delete`, `curl \| sh`, prod context'i → engelle |
| PreToolUse (Read/Bash) | `secret-guard` | `.env*`, `*.pem`, `id_*`, credential dosyaları → engelle |
| PreToolUse (Edit/Write) | `protected-paths` | `.claude/**`, `.github/workflows/**`, `scripts/verify*`, **main'e merge edilmiş migration** → engelle, gerekçe döndür |
| PreToolUse (Edit/Write) | `secret-scan` | Yazılan içerikte anahtar/token kalıbı → engelle |
| PostToolUse (Edit/Write) | `format-dispatch` | Dosya uzantısına göre ilgili stack plugin'inin formatter'ını çalıştır |
| PostToolUse (tümü) | `audit-trail` | Yerel JSONL: zaman, araç, dosya yolu (içerik yok) → SOC 2/ISO kanıtı |
| Stop | `verify-gate` | Kod değiştiyse `scripts/verify --fast`; kırmızıysa durmayı engelle ve hatayı geri besle (döngü korumalı) |
| PreCompact | `progress-note` | Plan dosyasına ilerleme notu düş *(Faz 5'e ertelendi)* |

**Skill'ler:**
- `init` — projeye kendi `templates/` iskeletini kurar (mevcut dosyanın üzerine asla yazmaz), stack'i algılar, uygun plugin'leri `settings.json`'a yazar, eksik compliance dokümanlarını açar.
- `plan` — işi analiz eder, `docs/plans/<id>.md` üretir (kabul kriterleri, riskler, test planı, etkilenen dosyalar).
- `implement` — planı küçük dilimlerle uygular, her dilimde hızlı doğrulama.
- `verify` — `scripts/verify` sonucunu yorumlar, kökü bulur.
- `pre-pr` — tam kapı: verify --full, değişiklik özeti, compliance etkisi, PR metni.
- `adr` — geri dönüşü zor kararı kaydeder.
- `guardrail` — kalıcı tuzağı path-scoped rule olarak kaydeder (eski GUARDRAILS.md'nin yeni hali).
- `env-request` — Claude korumalı bir yola dokunmak isterse değiştirmek yerine talep yazar.

**Agent'lar** (dar yetkili, çoğu salt okunur):
- `architect` — salt okunur, güçlü model; tasarım alternatifleri ve trade-off.
- `reviewer` — salt okunur; doğruluk ve proje kurallarına uygunluk.
- `security-auditor` — salt okunur; OWASP, authz, injection, secret.
- `test-engineer` — test yazar ve çalıştırır; prod koduna dokunmaz.
- ~~`explorer`~~ — yazılmaz: Claude Code'un yerleşik `Explore` agent'ı bu işi zaten yapıyor.

Built-in olanlar **yeniden yazılmaz**, yalnız projeye bağlanır: `/code-review`, `/security-review`, `/simplify`, `/init`, `/run`, `/fewer-permission-prompts`.

### 4.2 `governance` (zorunlu)

Not: Bu plugin uyum **sağlamaz**, uyumun mühendislik tarafını ve kanıtını üretir. Sertifikasyon ve hukuki değerlendirme insan (DPO, denetçi) işidir.

- **Skill'ler:** `setup` (kayıt iskeleti ve CI'ı kurar), `data-inventory` (VERBİS'e hazır veri envanteri, amaç, hukuki dayanak, saklama süresi), `threat-model` (STRIDE, `docs/security/threat-model.md`), `dpia` (yüksek riskli işleme etki analizi), `access-matrix` (rol × yetki), `audit-logging` (uygulama içi audit log tasarımı), `retention-and-erasure` (imha akışı; soft delete ≠ silme), `incident-response`, `control-map` (yapılan işi SOC 2 CC ve ISO 27001 Ek-A kontrollerine eşler).
- **Agent:** `compliance-auditor` — PR'ı veri envanteri ve kontrol haritasına karşı denetler.
- **Hook:** `inventory-check`. Şema dosyasına kişisel veri gibi görünen bir alan yazılınca "envanter güncellendi mi?" diye hatırlatır.
- **CI şablonları (Yasa katmanı):**
  - `security`: gitleaks, Semgrep CE, OSV-Scanner (açık ve lisans) ve SBOM (Syft).
  - `compliance`: veri envanteri kapısı ve PR başına compliance raporu.
  - `change-audit`: değişiklik yönetimi için tespit edici kontrol.

  CodeQL ve dependency review Free planda private repoda yok ([ADR-0004](adr/0004-ci-guvenlik-araclari.md)). Container tarama Faz 4'e, `devops-selfhosted`'a ertelendi. SOC 2 değişiklik yönetimi kanıtı = PR + yeşil CI + `change-audit`.
- **AI izlenebilirliği:** commit trailer ile AI katkısı işaretlenir; yerel audit-trail; istenirse ISO 42001'e hazırlık notları.

### 4.3 `work-github`

- Tek iş şeması: başlık, bağlam, kabul kriterleri, kapsam dışı, riskler, test planı, compliance etkisi.
- Kaynak seçimi: GitHub Issue **veya** `docs/pbi/<id>.md`. Skill ikisini de aynı akışla işler.
- Skill'ler: `setup` (issue formu, PBI klasörü, label'lar), `write-issue`, `take-issue` (sahiplenme → branch → plan → implement → pre-pr), `pr` (şablonlu PR, issue bağlama), `triage`.
- `gh` CLI kullanılır, MCP gerekmez (daha az context, daha az saldırı yüzeyi).

### 4.4 `design`

Amaç: hiçbir uygulama jenerik "AI yapımı" görünmesin.
- `design-direction` — proje başında: hedef kitle, his, referanslar, **kaçınılacak klişeler**; çıktı `DESIGN.md` + token dosyası (renk, tipografi ölçeği, spacing, radius, motion, yoğunluk, dark mode).
- `ui-build` — her UI işi DESIGN.md ve token'lara bağlı; hardcoded renk/ölçü yasak. Yasa katmanında `token-lint` (`/design:setup` kurar, verify ve CI'da çalışır) bunu yeni satırlar için zorlar.
- `ui-verify` — tarayıcıda açar, ekran görüntüsü alır, mobil/desktop/dark kontrol eder, axe ile WCAG 2.2 AA taraması yapar.
- `design-critic` agent — ekran görüntüsünü DESIGN.md'ye karşı eleştirir (hiyerarşi, ritim, kontrast, boş durumlar, hata durumları, mikro etkileşimler).
- UX kuralları: boş/yükleniyor/hata/kısmi veri durumları zorunlu; klavye ile kullanım; `prefers-reduced-motion`.

### 4.5 Stack plugin'leri (ortak sözleşme)

Her stack plugin'i aynı **sözleşmeyi** sağlar, böylece yeni stack eklemek mekanik olur. Sözleşme `stack.json` dosyasında tanımlıdır ve ortak `setup` script'i onu projeye uygular ([ADR-0006](adr/0006-stack-sozlesmesi.md)):

| Parça | İçerik |
| --- | --- |
| `rules/` | Path-scoped kurallar (ör. `**/*.cs` düzenlenince yüklenir) |
| Skill'ler | `scaffold`, `test`, `upgrade-deps`, stack'e özel 2–4 skill |
| LSP | Dil sunucusu (gerçek tip/tanım bilgisi için) |
| Hook | Formatter + linter (format-dispatch'e kayıt) |
| `verify` katkısı | `scripts/verify`'a eklenecek komutlar |
| Guardrail'ler | O stack'in sessiz bozan tuzakları |

Örnek odaklar:
- **dotnet:** nullable açık, analyzers as errors, EF Core migration disiplini, minimal API/Clean Architecture seçimi ADR ile.
- **java-spring:** Modulith sınırları, ArchUnit, Flyway forward-only, Testcontainers.
- **web:** React Server Components sınırları, bundle bütçesi, Core Web Vitals, design plugin ile entegre.
- **node:** strict TS, zod ile sınır doğrulama, Nest/Fastify desenleri.
- **python:** uv, ruff, mypy/pyright strict, pytest.
- **mobile:** Swift/SwiftUI, Kotlin/Compose, RN; simulator ile görsel doğrulama; mağaza ve gizlilik manifest kuralları.
- **data-sql:** migration güvenliği (lock, backfill, expand/contract), index review, RLS, sorgu planı, `db-reviewer` agent.
- **data-nosql:** şema sürümleme, erişim desenine göre modelleme, TTL ve indeks disiplini.

### 4.6 `devops-selfhosted`

- Docker (çok aşamalı, non-root, distroless), Compose, Kubernetes/Helm, Coolify/VPS.
- Gözlemlenebilirlik: OpenTelemetry, yapılandırılmış log (PII'siz), health/readiness.
- Secret yönetimi (SOPS/sealed-secrets), yedek ve geri dönüş testi, sıfır kesintili deploy.
- **Bulut eklenebilirliği:** `docs/YENI-BULUT-EKLEME.md` + `templates/plugin-skeleton/`. Bir bulut plugin'i (aws/azure/gcp) şu sözleşmeyi doldurur: `deploy`, `secrets`, `iac`, `observability`, `cost-guard` skill'leri + o bulutun tehlikeli komutlarını `command-guard`'a kaydeden hook.

---

## 5. MCP ve "sosyal medyada gördüğüm şu skill" politikası

Her connector ve skill context harcar, saldırı yüzeyi açar ve prompt injection taşıyabilir. Bu yüzden **kabul politikası**:

1. İhtiyaç yoksa ekleme. Bir CLI aynı işi yapıyorsa (ör. `gh`) MCP ekleme.
2. Üçüncü taraf skill/plugin **doğrudan kurulmaz**; incelenir, gerekiyorsa bu repoya alınıp sahiplenilir (vendoring).
3. Her ekleme bir PR + kısa ADR: ne çözüyor, ne pahasına, kim sahibi.
4. Eval'i olmayan skill marketplace'e girmez.

Başlangıç önerisi (proje bazında, opsiyonel): tarayıcı otomasyonu (UI doğrulama için), güncel kütüphane dokümanı sağlayan bir docs MCP'si, yalnız **lokal dev veritabanına** salt okunur DB MCP'si. Hata izleme (ör. Sentry) ihtiyaç doğunca.

---

## 6. Projeye kurulum akışı (takım arkadaşı gözünden)

1. Bir kez: `gh auth login` + `gh auth setup-git`, sonra `claude plugin marketplace add Nunoguz/ideal-agentic-env`. Private repo için Claude Code makinedeki git kimlik bilgisini kullanır; tek başına `GITHUB_TOKEN` yetmez. Arka plan otomatik güncellemesi varsayılan kapalıdır (`/plugin` → Marketplaces).
2. Yeni projede: `/core:init` → stack algılanır, iskelet kurulur, `.claude/settings.json`'a gerekli plugin'ler yazılır.
3. Projeyi klonlayan diğer arkadaşlar klasöre güvenince eksik plugin'leri kurmaları istenir.
4. `scripts/verify`, CI workflow'ları, PR şablonu, CODEOWNERS ve compliance doküman iskeleti hazırdır.

Projede kalan (plugin'e taşınamayan) dosyalar:

```
CLAUDE.md                         # ≤120 satır, YALNIZ projeye özel: domain, mimari, komutlar
.claude/settings.json             # izinler, plugin listesi, auto mode, sandbox
.claude/rules/*.md                # path-scoped proje kuralları + guardrail'ler
docs/{adr,plans,pbi,security,compliance}/
scripts/verify
.github/workflows/  .github/CODEOWNERS  .github/pull_request_template.md
DESIGN.md                         # UI'lı projelerde
```

---

## 7. Marketplace reposunun kendi kalitesi

- **CI:** plugin manifest doğrulama, hook birim testleri, skill eval'leri (`claude plugin eval`), markdown/link kontrolü.
- **Sürümleme:** plugin başına semver + CHANGELOG; kırıcı değişiklik = major + göç notu.
- **Sahiplik:** CODEOWNERS; `main` korumalı, her değişiklik PR ile.
- **Context bütçesi:** her plugin'in sabit context maliyeti ölçülür (skill açıklamaları, anayasa, kurallar); bütçe aşılırsa CI uyarır.
- **Dogfooding:** her faz sonunda örnek bir projede uçtan uca denenir.

---

## 8. Yol haritası

| Faz | İçerik | Bitti sayılır |
| --- | --- | --- |
| **0 — Temel** | Repo iskeleti, marketplace.json, bu reponun CLAUDE.md'si, ADR-001 (bu kararlar), repo CI'ı | `plugin validate` yeşil, boş plugin'ler kurulabiliyor |
| **1 — Core** | Anayasa, tüm hook'lar (+ testleri), core skill ve agent'lar, `templates/project`, `init` | Boş bir projeye `init` → çalışan verify + hook'lar + CI |
| **2 — Governance + İş** | `governance`, `work-github`, CI güvenlik şablonları, Free plan telafi kontrolleri | Örnek issue uçtan uca: plan → PR → yeşil CI + compliance raporu (bu repo üzerinde dogfood) |
| **3 — İlk stack dalgası** | `stack-web` + `stack-node` + `data-sql` + `design`, stack sözleşmesi ([ADR-0006](adr/0006-stack-sozlesmesi.md)) | Ayrı private repoda örnek full-stack uygulama, görsel doğrulamalı ([iae-sample-fullstack](https://github.com/Nunoguz/iae-sample-fullstack) (private örnek repo); bkz. §8.1) |
| **4 — İkinci dalga** | `stack-web`'e Vue ve Nuxt, `stack-dotnet` (`data-sql`'e EF Core ve SQL Server), `stack-mobile` (React Native/Expo), `devops-selfhosted`, bulut plugin şablonu; governance yenileme mekanizması ve önem politikası; stack sözleşmesi v2 ([ADR-0010](adr/0010-stack-sozlesmesi-v2.md)) | Fixture CI'ında setup + `verify --full` yeşil (Nuxt, .NET + SQL Server); ayrı repoda gerçek oturumlarla kurulmuş örnek uygulama, `verify --full` yeşil (.NET + PostgreSQL, Vue, Expo, devops) ([iae-sample-dotnet-vue](https://github.com/Nunoguz/iae-sample-dotnet-vue) (private örnek repo); bkz. §8.2) |
| **5 — Sertleştirme** | Kapsam dondurma, olgunluk etiketi ve v1.0 ([ADR-0012](adr/0012-v1-surum-sozu.md)), takım onboarding'i ([GETTING-STARTED.md](GETTING-STARTED.md)), `stack-java-spring` | **Tamam** (bkz. §8.3). Rehber temiz ortamda baştan sona denendi; stabil plugin'ler 1.0.0'da |

### 8.1 Faz 3 kapanışı (2026-11-23)

**Kanıt:**
- **Örnek uygulama:** [iae-sample-fullstack](https://github.com/Nunoguz/iae-sample-fullstack) (private örnek repo). Next.js 16, Fastify 5, PostgreSQL ve Drizzle.
- **Kurulum:** baştan sona marketplace'ten, gerçek Claude Code oturumlarında yapıldı. Sırasıyla:
  - `/core:init`
  - `/governance:setup`, `/work-github:setup`
  - dört stack setup'ı
  - `/design:design-direction`
- **Doğrulama:** CI'da `verify --full`. Kapsamı:
  - lint, typecheck, migration-check, token-lint;
  - gerçek veritabanına karşı API testleri;
  - build ve bundle bütçesi;
  - Playwright akış testleri;
  - `ui-verify`: 5 ekran ve durum × 375/1280 px × light/dark = 20 görüntü, axe WCAG 2.2 AA'da 0 ihlal. Görüntüler CI artifact'ı olarak saklanıyor (ilk yeşil koşu, private örnek repoda).
- **İnceleme:** `design-critic` agent'ı ekran görüntülerini inceledi. "Must fix" bulgularının hepsi düzeltildi.
- **Yasa katmanının gerçek bir projede çalıştığı görüldü:** lisans kapısı LGPL ve CC-BY bağımlılıklarını, tam tarama iki dev-bağımlılığı açığını durdurdu. Kararlar örnek repoda ADR-0001'e yazıldı.

**Dogfood'da bulunup düzeltilenler:**
- **shell-guard:** korumalı yollara shell üzerinden yazmayı da yakalıyor (core 0.2.1).
- **`core:init`:** monorepo'da her paketi algılıyor (core 0.3.1).
- **verify-gate:** aynı hatayı tekrar tekrar engellemiyor (core 0.3.1).
- **Stack setup:** formatter çakışmasını önlüyor (stack 0.1.1).
- **migration-check:** lock_timeout uyarısındaki yanlış pozitif giderildi (data-sql 0.1.1).
- **change-audit:** yerini yeni koşuya bırakmış iptal edilmiş koşuları saymıyor (governance 0.1.3).

**Faz 4 ve 5'e devredilenler** (1–5 Faz 4'te kapandı, bkz. §8.2):
1. **governance, monorepo lisans taraması:** workspace paketleri lisans taramasında `UNKNOWN` çıkıyor. `setup`, birinci taraf paketler için gerekçeli bir `osv-scanner.toml` istisnası üretmeli.
2. **governance, güvenlik kapısının önem derecesi politikası:** Bugün orta seviye bir dev-bağımlılığı açığı bile PR'ı durduruyor. Kullanıcı geri bildirimi: "bize kesinti yaşatmasın". Öneri: yalnız High/Critical ve üretim bağımlılıkları kırmızı, diğerleri rapor ve bitiş tarihli istisna. ADR-0004'ü değiştirir.
3. **Stack sözleşmesine CI katkısı:** Stack plugin'leri bugün CI'a service container (Postgres) ya da tarayıcı kurulumu ekleyemiyor; örnek repoda `ci.yml` elle genişletildi.
4. **npm 11:** install script'lerini varsayılan olarak çalıştırmıyor (`allowScripts`). Bunun stack-node ve stack-web kurallarında belgelenmesi gerekiyor.
5. **Örnek uygulamada eksik kalanlar:** ayrıntı ekranı ve "Ödünç alanı göster" (kişisel veri erişimi + audit log), kimlik doğrulama, periyodik imha işi. governance'ın `audit-logging` skill'ini gerçek bir akışla sınamak için iyi bir aday.
6. **Faz 5'te yeniden değerlendirilecekler:** squawk ([ADR-0007](adr/0007-migration-guvenligi.md)), Core Web Vitals otomasyonu, ~~Vue profili~~ (Faz 4'te geldi), Windows'ta gerçek bir Claude oturumu.

---

### 8.2 Faz 4 kapanışı (2026-11-23)

**Kararlar (repo sahibi):**
- Kapsam: Vue ve Nuxt, .NET (PostgreSQL ve SQL Server), React Native/Expo, devops-selfhosted, bulut şablonu. `stack-java-spring`, `stack-python`, `data-nosql` ve native mobil Faz 5'e.
- Tek branch, tek PR; kanıt hibrit: bu repoda fixture CI ve tek bir yeni örnek repo.
- Güvenlik kapısı: CVSS 7.0 ve üstü kırmızı, altı rapor ([ADR-0009](adr/0009-bagimlilik-kapisi-onem-politikasi.md)). Container taramasında düzeltmesi olmayan açıklar rapor ([ADR-0011](adr/0011-container-tarama.md)).
- Varsayılan lisans allowlist'ine `MIT-0` ve `PostgreSQL` eklendi.
- Aynı sürüm hattındaki resmî güvenlik yaması, kırmızı bir bulguyu düzeltiyorsa 14 günlük cooldown'u beklemez (ADR-0009 eki). Örnek repoda ASP.NET runtime 10.0.14 → 10.0.15.
- Örnek uygulamada nginx kaldırıldı: düzeltilmiş imajı henüz yayımlanmamış Critical açıklar yüzünden SPA'yı API sunuyor.

**Kanıt:**
- **Fixture CI** (`.github/workflows/fixtures.yml`): Nuxt (stack-web) ve .NET + SQL Server (stack-dotnet, data-sql; EF Core migration'ı ve SQL Server service container'ına karşı entegrasyon testleri). Her fixture'da setup'ların ikinci çalıştırmada hiçbir şey değiştirmediği de doğrulanır.
- **Örnek uygulama:** [iae-sample-dotnet-vue](https://github.com/Nunoguz/iae-sample-dotnet-vue) (private örnek repo). .NET 10 API (EF Core + PostgreSQL, Identity), Vue 3 web, Expo mobil, chiseled ve nginx-unprivileged imajları.
  - `/core:init`, `/governance:setup` ve `/stack-dotnet:setup` gerçek Claude Code oturumlarında (`--plugin-dir`), diğer setup'lar script'leriyle.
  - Faz 3'ten devredilen B6: ayrıntı ekranı, gerekçe isteyen ve audit log'a yazan "Ödünç alanı göster", kimlik doğrulama (web cookie, mobil bearer, kayıt kapalı), periyodik imha işi. API entegrasyon testleri gerçek PostgreSQL'e karşı.
  - `verify --full` yerelde 12 adımda yeşil. Web uygulama içi tarayıcıda (light/dark, 375 px) ve mobil iOS simulator'da (Expo Go, light/dark) görsel olarak kontrol edildi.
- **iae-sample-fullstack:** governance `--refresh` ile güncellendi; hatalı 0.1.2 `change-audit.mjs` gitti, CI parçaları bölgelere taşındı.

**Dogfood'da bulunup düzeltilenler:**
- OSV-Scanner `--x-exclude` glob'u mutlak yola göre eşliyor; kapı göreli deseni düzeltiyor.
- `expo install --check` çevrimiçi en yeni yamayı istiyor ve cooldown'u bozuyor; `expo:check` `EXPO_OFFLINE=1` ile çalışıyor.
- `vue-language-server` Claude Code'da zaman aşımına düşüyor; `.vue` için TS dil sunucusu + `@vue/typescript-plugin`.
- TypeScript 7'de JS API yok, TypeScript 6'da `@types` paketleri kendiliğinden yüklenmiyor; ortak npm kuralına yazıldı.
- `MapIdentityApi` ile fallback authorization policy `/login`'i kilitliyor.
- EF Core migration'ları BOM'la yazıyor; core'un `.editorconfig`'i onları üretilmiş kod sayıyor. Dockerfile'ın build aşaması `.editorconfig`'i de kopyalamalı.
- `Directory.Build.props` şablonu test adlarındaki alt çizgiye (CA1707) izin veriyor.
- nginx'te `location` içindeki `add_header` güvenlik başlıklarını siliyor (Semgrep yakaladı).
- nginx-unprivileged'ın en yeni imajı düzeltilmiş High/Critical paketlerin eskilerini taşıyor. Alpine paketleri runtime aşamasında yükseltilebiliyor, ama nginx'in kendisi nginx.org deposundan geldiği için yükseltilemiyor; örnek uygulamada nginx kaldırıldı.
- Container kapısı ile cooldown birbirini kilitledi; güvenlik yamaları için istisna kararı alındı.

**Faz 5'e devredilenler:**
1. `stack-java-spring`, `stack-python`, `data-nosql` ve native mobil profilleri (Swift/SwiftUI, Kotlin/Compose).
2. Mobil uçtan uca akış: simulator aracının dokunma ve yazma girdisi Expo Go'daki uygulamaya ulaşmadı; giriş sonrası ekranlar simulator'da görülemedi. CocoaPods kurulu olmadığı için native iOS build denenmedi; Android emulator denenmedi.
3. Vue örneğinde `ui-verify` (Playwright + axe) kurulmadı; görsel kontrol elle yapıldı.
4. `devops-selfhosted`'ın Kubernetes/Helm profili gerçek bir projede sınanmadı; bulut plugin'i yalnız şablon olarak var.
5. SQL Server istemcisinin native paketleri lisans kapısında "non-standard" görünüyor; SQL Server kullanan ilk gerçek projede repo sahibinin kararı gerekecek.
6. iae-sample-fullstack'teki iki dev bağımlılığı istisnası yeni politikada gereksiz; kaldırmak repo sahibinin kararı.
7. core:init, sonradan eklenen bir stack'i (ör. Dockerfile'dan sonra devops) `enabledPlugins`'e kendiliğinden eklemiyor.
8. squawk ([ADR-0007](adr/0007-migration-guvenligi.md)), Core Web Vitals otomasyonu, Windows'ta gerçek bir Claude oturumu.

### 8.3 Faz 5 kapanışı (2026-11-24)

**Kararlar (repo sahibi):**
- Faz 5 yeni özellik getirmiyor; tek istisna `stack-java-spring`. Ortam bu fazla takımın kullanımına açılıyor.
- Olgunluk etiketi ve semver sözü ([ADR-0012](adr/0012-v1-surum-sozu.md)):
  - stabil (1.0.0): core, governance, work-github, design, data-sql, stack-web, stack-node, stack-dotnet, stack-java-spring, devops-selfhosted;
  - deneysel: stack-mobile (0.1.x), devops-selfhosted'ın Kubernetes profili, stack-java-spring'in Gradle desteği, bulut şablonu.
- İçi boş `stack-python` ve `data-nosql` katalogdan ve repodan çıkarıldı.
- iae-sample-fullstack'teki iki dev-bağımlılığı istisnası kaldırıldı (iae-sample-fullstack#4, private örnek repo). Önem politikası artık onları raporluyor.
- Maven'da bir pom'un listelediği birden çok lisans seçim sayılıyor. EPL-2.0 allowlist'e girmedi. Logback ve Jakarta Annotations her Spring projesinde, proje sahibinin onayıyla bitiş tarihli bir istisna istiyor; fixture'daki istisnaları repo sahibi onayladı.
- SQL Server native istemci paketleri varsayılan lisans allowlist'ine girmiyor; SQL Server kullanan her proje, gerekçeli ve bitiş tarihli bir istisnayla kendisi karar veriyor (data-sql README).

**Kanıt:**
- **Fixture CI:** `fixtures/spring-postgres` (Spring Boot 4.1, Spring Modulith 2.1, Flyway, Testcontainers PostgreSQL). Kapsamı:
  - setup'ların ikinci çalıştırmada hiçbir şey değiştirmemesi,
  - `verify --full`: Modulith sınır testi ve gerçek PostgreSQL'e karşı MockMvc testleri,
  - governance'ın bağımlılık kapısı.
- **Onboarding denemesi:** onboarding rehberinin akışı temiz bir geçici repoda ve ayrı bir Claude config'inde denendi:
  - marketplace bu branch'ten eklendi, plugin'ler proje kapsamında kuruldu;
  - gerçek Claude oturumlarında sırasıyla `/core:init`, `/governance:setup`, `/work-github:setup`, ilk değişiklik (bir Spring Boot servisi), `/core:init` tekrarı, `/stack-java-spring:setup` ve `/data-sql:setup` çalıştırıldı;
  - `verify --fast` yeşil çıktı. `verify --full` yerelde Docker diski dolu olduğu için koşamadı; aynı testler fixture CI'ında yeşil.

**Denemede bulunup düzeltilenler:**
- **Java projelerinde bağımlılık taraması kördü.** OSV-Scanner, sürümü parent pom'dan ya da BOM'dan gelen bağımlılıkları çözemiyor ve Maven paketlerinin lisansını bulamıyor. Spring Boot projesinde kapı hiçbir şey taramadan yeşil geçiyordu. Kapı artık Maven'a çözülmüş ağacı CycloneDX SBOM olarak ürettiriyor, lisansları SBOM'dan okuyor ve ağaç çözülemezse kırmızı oluyor (governance 1.0.0).
- Bağımlılık kapısı kaç paketi hangi kaynaklardan taradığını söylemiyordu. Tarayıcının bir şey görmediği yeşil bir kapı fark edilmiyordu (governance 1.0.0).
- Java projesinde data-sql CI'a veritabanı servisi eklemiyor (testler Testcontainers kullanıyor), ama bunu söylemiyordu (data-sql 1.0.0).
- LSP kontrolü binary'yi `--version` ile çalıştırıyordu; jdtls'te bu sunucuyu başlatır. Artık PATH'te aranıyor.
- `core:init` Java için stack plugin'iyle çakışan verify adları ve sabit bir Java 21 CI adımı yazıyordu.
- Rehbere yazılanlar: her setup ayrı bir mesaj olarak çalıştırılmalı; boş repoda verify boş kalır; sonradan eklenen bir stack için `/core:init` tekrar çalıştırılır (§8.2 madde 7'nin çözümü bu).

**Talep gelince (donmuş kapsam):** bunlar ancak gerçek bir proje isteyince gelir.
- `stack-python`, `data-nosql`,
- native mobil (Swift/SwiftUI, Kotlin/Compose),
- devops'un Kubernetes/Helm profilinin gerçek bir projede kanıtlanması,
- bulut plugin'leri (`cloud-*`, [YENI-BULUT-EKLEME.md](YENI-BULUT-EKLEME.md)).

**Sonra (onboarding'i engellemeyen):**
1. Mobil uçtan uca akış: giriş sonrası ekranlar, native iOS/Android build.
2. Vue örneğinde `ui-verify`.
3. squawk ([ADR-0007](adr/0007-migration-guvenligi.md)), Core Web Vitals otomasyonu, Windows'ta gerçek bir Claude oturumu.
4. `jdtls`'in gerçek bir Claude oturumunda denenmesi; Gradle'ın gerçek bir projede kanıtlanması.
5. governance'ın doküman şablonları İngilizce; `--docs-language Turkish` seçen projeler için Türkçe şablon.
6. Gerçek bir takım arkadaşının onboarding denemesi ([GETTING-STARTED.md](GETTING-STARTED.md)) (repo sahibi ayarlıyor) ve geri bildirim listesinden çıkanlar.

---

### 8.4 One-step onboarding (2026-11-24)

- The marketplace is public under MIT and was recreated with one initial commit, so that its history holds no personal data or private names.
- core is installed for the user and stays dormant outside set-up projects.
- `/core:init` detects, lets the user pick, installs, scaffolds, runs every setup and verifies, in one run. `/core:plugins` adds and removes plugins later.
- `main` has branch protection.
- Getting started is three steps: [GETTING-STARTED.md](GETTING-STARTED.md) and [ADR-0013](adr/0013-one-step-onboarding.md).

---

## 9. Açık sorular (Faz 0 öncesi)

1. ~~Faz 3'teki ilk stack dalgası~~ → `stack-web` + `stack-node` + `data-sql` + `design`. ~~`stack-dotnet` Faz 4'te~~ → Faz 4'te geldi (§8.2).
4. ~~Branch protection~~ → GitHub Free'de kalınıyor. Yerine telafi kontrolleri kullanılıyor ([ADR-0003](adr/0003-free-planda-yasa-katmani.md)).
2. ~~Windows~~ → Evet, var. Hook'lar exec-form Node, CI üç platformda ([ADR-0002](adr/0002-cok-platformlu-hook-tasarimi.md)); PR'larda macOS bacağı koşmaz ([ADR-0005](adr/0005-ci-platform-matrisi-ve-dakika-kotasi.md)).
3. ~~Repo yolu~~ → `Nunoguz/ideal-agentic-env` (private).
