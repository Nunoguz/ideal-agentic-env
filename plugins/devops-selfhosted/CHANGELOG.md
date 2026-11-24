# Changelog — devops-selfhosted

## 1.0.0

- Stabil: 1.x içinde kırıcı değişiklik yok; kırıcı her değişiklik major sürüm ve göç notuyla gelir ([ADR-0012](../../docs/adr/0012-v1-surum-sozu.md)). 0.1.0'ın üzerine yalnız bu bölümdeki maddeleri getirir.
- Ortak setup kütüphanesi (`stack-lib.mjs`) güncellendi: Maven/Gradle manifestleri, `dependencyPrefixes` koşulu, platforma göre verify komutu, koşullu Dependabot girdisi. LSP kontrolü binary'yi artık çalıştırmıyor, PATH'te arıyor. Bu plugin'in davranışı değişmedi.

## 0.1.0

- `dockerfile.md`: kırmızı bir bulguyu düzelten aynı hat yama imajı cooldown beklemez (ADR-0009 eki).
- İlk sürüm: `docker`, `compose` ve `kubernetes` profilleri ve kuralları.
- `container` workflow'u ve `container-scan.mjs` ([ADR-0011](../../docs/adr/0011-container-tarama.md)): Trivy 0.76.2 (sha256 pinli) ile imaj ve yanlış yapılandırma taraması. Düzeltmesi olmayan açıklar rapora düşer (repo sahibinin kararı, 2026-11-23).
- `dockerfile.md`: taban imaj henüz yeniden build edilmemişse, düzeltmesi yayımlanmış High/Critical paketleri runtime aşamasında yükseltmek kabul edilir (örnek repoda nginx-unprivileged ile görüldü).
- `guardedCommands`: deploy, secret ve yedek komutları için core shell-guard'a proje kuralları.
- `docker` Dependabot girdisi.
- Skill'ler: `dockerize`, `deploy`, `secrets`, `observability`, `backup-restore`. `dockerize`, nginx'te `location` içindeki `add_header`'ın güvenlik başlıklarını silmesine karşı uyarır (örnek repoda Semgrep yakaladı).

## 0.0.1

- İskelet oluşturuldu (Faz 0).
