# ADR-0001: Ortamı private bir Claude Code plugin marketplace'i olarak kurmak

- **Durum:** Kabul edildi
- **Tarih:** 2026-11-23

## Bağlam

Yaygın yaklaşım, bütün AI çalışma ortamını tek bir proje reposunun içine gömüyordu. Bu ortam bir kural kaynağı, o kaynaktan üç araç için üretilen talimat dosyaları, playbook'lar ve kapı script'lerinden oluşuyordu. Bu yaklaşımın sorunları:

- Her yeni proje ortamı kopyalıyordu ve projeler zamanla birbirinden kopuyordu.
- Kuralların neredeyse tamamı metindi. Model bu metni her zaman uygulamıyordu.
- Çoklu araç desteği (Claude, Codex, Copilot) üretim ve parite bakımı gerektiriyordu.

Takım küçük ve herkesin bireysel Pro/Max hesabı var, yani managed settings yok. Yine de her projede KVKK, SOC 2 ve ISO 27001 düzeyinde disiplin isteniyor.

## Karar

1. Ortam, **private GitHub reposunda bir Claude Code plugin marketplace'i** olarak dağıtılır (`Nunoguz/ideal-agentic-env`).
2. Yalnız **Claude Code** hedeflenir. Çoklu araç üretimi ve parite kontrolü yapılmaz.
3. İçerik, ihtiyaca göre kurulan **13 plugin**'e bölünür. Bunların ikisi zorunludur: `core` ve `governance`. Projeye özel kalması gereken dosyaları plugin'ler taşıyamaz (CLAUDE.md, izinler, CI). Bu dosyaları `core:init` projeye kurar.
4. Kurallar üç katmanda uygulanır:
   - **Tavsiye:** metin.
   - **Kural:** Claude Code hook'ları.
   - **Yasa:** git hook, CI ve branch protection.

   "Asla olmamalı" sınıfındaki her kural Yasa katmanında da bulunur.
5. Makineye yönelik içerik İngilizce, insana yönelik doküman Türkçe yazılır.
6. Plugin sürümü yalnız `plugin.json`'da tutulur (semver). Repo kuralları `scripts/validate.mjs` ile, resmî şema ise CI'da `claude plugin validate --strict` ile denetlenir.

## Sonuçlar

**Olumlu**

- Tek yerden sürümlenir ve güncellenir.
- Projeler yalnız ihtiyaç duyduğu plugin'i kurar, böylece context daha küçük kalır.
- Hook'lar sayesinde kurallar deterministik hale gelir.

**Olumsuz ve riskler**

- Private repo nedeniyle her kişinin `gh auth login` ve `gh auth setup-git` yapması gerekir. Arka planda otomatik güncelleme varsayılan olarak kapalıdır.
- Managed settings olmadığı için bir geliştirici plugin'i kapatabilir. Bu boşluğu CI'daki Yasa katmanı kapatır.
- Plugin CLAUDE.md taşıyamaz. Her oturumda geçerli olması gereken bağlam, `core`'un SessionStart hook'u ile enjekte edilir.

## Değerlendirilen alternatifler

- **Template repo:** Basit, ama projeler zamanla birbirinden kopar ve güncellemeleri elle taşımak gerekir.
- **Yalnız global `~/.claude`:** Takımla paylaşılamaz ve sürümlenemez.
- **Public marketplace:** Kurulumu en kolay seçenek, ama iç kurallar ve süreçler dışarıya açılır.
