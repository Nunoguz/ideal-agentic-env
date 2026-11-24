# devops-selfhosted

> **Durum:** Stabil, 1.0.0. Dockerfile ve Compose iae-sample-dotnet-vue'da kanıtlandı. **Kubernetes profili deneysel:** gerçek bir projede sınanmadı, 1.x semver sözünün dışında ([ADR-0012](../../docs/adr/0012-v1-surum-sozu.md)).

Kendi sunucunda (VPS, Coolify, Kubernetes) çalışan projeler için container, deploy ve işletim disiplini. Bulut sağlayıcıları (AWS, Azure, GCP) ayrı plugin'ler olarak eklenir: [docs/YENI-BULUT-EKLEME.md](../../docs/YENI-BULUT-EKLEME.md).

## Ne yapar?

- **Kurallar (path-scoped):**
  - `dockerfile.md`: çok aşamalı build, digest'e pinli taban imaj, non-root kullanıcı, `.dockerignore`, imajda secret yok, lockfile'a göre kurulum, exec-form başlatma.
  - `compose.md`: `127.0.0.1`'e bağlı portlar, healthcheck ve `depends_on`, secret'lar git'e girmeyen `.env`'de, salt okunur container'lar.
  - `kubernetes.md`: kaynak limitleri, ayrı readiness/liveness probe'ları, güvenlik bağlamı, kesintisiz rollout, NetworkPolicy, secret'lar düz manifestte değil, migration'lar ayrı bir Job'da.
- **Yasa katmanı: `container` workflow'u** ([ADR-0011](../../docs/adr/0011-container-tarama.md)). Her imajı build eder ve Trivy (sürüm ve sha256 ile pinli) ile tarar; Dockerfile, Compose, Kubernetes ve Helm dosyalarında yanlış yapılandırma arar.
  - **Kırmızı:** düzeltmesi olan High/Critical açık, imaja gömülmüş secret, High/Critical yanlış yapılandırma (ör. root kullanıcı).
  - **Yalnız rapor:** henüz düzeltmesi olmayan açıklar (düzeltme çıkınca kırmızıya döner), daha düşük önemler, desteği bitmiş taban işletim sistemi. Haftalık çalışma bunlar için tek bir `[vulnerability-report]` issue'sunu açık tutar.
  - PR'da yalnız ilgili dosyalar değişince, `main`'de ve haftalık çalışır.
- **Kural katmanı:** setup, `.claude/ideal-agentic-env.json`'a `guardedCommands` ekler. core'un shell-guard'ı şunlardan önce onay ister: `docker push`, `sops --decrypt`, Kubernetes secret'larını okumak, `kubectl apply`, `helm upgrade`, sunucuya `ssh`/`scp`/`rsync`, `pg_restore --clean`, yedek snapshot'larını silmek.
- **Dependabot:** `docker` ekosistemi; pinli taban imaj digest'leri 14 gün cooldown'la güncellenir.

## Skill'ler

| Skill | Nasıl çağrılır | Ne yapar |
| --- | --- | --- |
| `setup` | `/devops-selfhosted:setup` | Kuralları, korunan komutları, Dependabot girdisini ve container workflow'unu kurar. |
| `dockerize` | `/devops-selfhosted:dockerize` | Servis için Dockerfile, `.dockerignore` ve yerel `compose.yaml` yazar (Node, .NET chiseled, nginx-unprivileged). |
| `deploy` | `/devops-selfhosted:deploy` | Yazılı plan, önce migration, kesintisiz rollout, smoke test ve geri dönüş. Hedefe dokunan her adım insan onaylı. |
| `secrets` | Otomatik | SOPS + age, Sealed Secrets, rotasyon, ifşa durumunda önce rotasyon. |
| `observability` | Otomatik | OpenTelemetry, kişisel veri içermeyen yapılandırılmış log, health endpoint'leri, belirti odaklı alarmlar. |
| `backup-restore` | Otomatik | Yedek planı, şifreleme, saklama süresi ve zamanlanmış geri yükleme testi (kanıt olarak kaydedilir). |

## Kurulum

Önce `/core:init` ve `/governance:setup`.

```bash
claude plugin install devops-selfhosted@ideal-agentic-env --scope project
```

Sonra projede `/devops-selfhosted:setup` çalıştır.

## Sınırlar

- Container build'i ve taraması yerelde Docker ister. Docker olmayan bir makinede kontrol CI'da çalışır.
- `.trivyignore` istisnaları repo sahibinin kararıdır.
