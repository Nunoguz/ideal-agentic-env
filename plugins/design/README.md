# design

> **Durum:** Stabil, 1.0.0.

Proje başına tasarım dili ve UI kalitesi: hiçbir uygulama jenerik "AI yapımı" görünmesin.

## Ne yapar?

- **`/design:design-direction`:**
  - Hedef kitleyi, istenen hissi, referansları ve kaçınılacak klişeleri soran bir görüşme yapar.
  - Önce iki yön önerir.
  - Seçilen yöne göre `DESIGN.md` ve bir token dosyası yazar: renk (light ve dark), tipografi ölçeği, spacing, radius, elevation, motion. Kontrast oranları hesaplanarak tabloya yazılır.
- **Yasa katmanı: `token-lint`.**
  - `/design:setup`, `.github/scripts/token-lint.mjs`'i kurar ve `verify.fast`'e ekler.
  - UI dosyalarına eklenen satırlarda token dosyaları dışında sabit renk (hex, `rgb()`, `oklch()`…) ya da ölçü (px, rem, em) varsa kırmızıya döner.
  - Mevcut kod, dokunulana kadar işaretlenmez.
  - Gerekçeli istisna: `token-lint: allow <gerekçe>`.
- **Kurallar (path-scoped):** `ui.md`.
  - Dört veri durumu (yükleniyor, boş, hata, dolu) zorunlu.
  - Klavye ve focus.
  - WCAG 2.2 AA kontrast.
  - 320 px'ten başlayan responsive düzen.
  - `prefers-reduced-motion`.
  - Tasarlanmış dark mode.
- **`ui-verify`:**
  - Playwright ile 375 ve 1280 px genişlikte, light ve dark ekran görüntüsü alır.
  - axe ile WCAG 2.2 AA taraması yapar; tek bir ihlal bile testi kırmızıya çevirir.
  - Yatay taşma ve focus kontrolü yapar.
  - MCP gerekmez.
- **`design-critic` agent'ı:** ekran görüntülerini `DESIGN.md`'ye karşı eleştirir. Salt okunurdur.

## Skill'ler ve agent

| Bileşen | Nasıl çağrılır | Ne yapar |
| --- | --- | --- |
| `setup` | `/design:setup` | Kuralları, token-lint'i ve design ayarlarını kurar. |
| `design-direction` | `/design:design-direction` | `DESIGN.md` ve token dosyasını üretir. |
| `ui-build` | Otomatik | UI işini DESIGN.md'ye ve token'lara bağlar. |
| `ui-verify` | Otomatik | Ekran görüntüsü, axe taraması ve eleştiri. |
| `design-critic` | Agent | Ekran görüntülerini salt okunur olarak eleştirir. |

## Kurulum

Önce `/core:init`.

```bash
claude plugin install design@ideal-agentic-env --scope project
```

Sonra `/design:setup` ve `/design:design-direction`.
