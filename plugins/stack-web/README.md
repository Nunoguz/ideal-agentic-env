# stack-web

> **Durum:** Stabil, 1.0.0.

TypeScript/JavaScript frontend'leri için stack plugin'i: web (ortak), React, Next.js, Vue ve Nuxt.

## Ne yapar?

- **Kurallar (path-scoped):** `/stack-web:setup`, algıladığı frontend paketleri için kuralları `.claude/rules/stack-web/` altına yazar. Kurallar yalnız o paketin dosyalarına dokunulunca yüklenir.
  - `web.md`: sınırda doğrulama, bundle'a secret sızmaması, XSS, WCAG 2.2 AA temelleri, performans ve hydration tuzakları.
  - `react.md`: saf bileşenler, effect disiplini, dört veri durumu, Testing Library.
  - `next.md`: Server/Client sınırı, `server-only`, Server Action'ların herkese açık bir endpoint gibi doğrulanması, cache ve güvenlik başlıkları.
  - `vue.md`: `<script setup lang="ts">`, tipli props/emits, sessizce kırılan reaktivite tuzakları (destructure, `watch`), Pinia, `v-html`, `vue-tsc`.
  - `nuxt.md`: sunucu/istemci sınırı, `useFetch`/`useAsyncData`, istekler arası veri sızdıran modül seviyesi state, Nitro route'larında doğrulama ve yetki, `runtimeConfig.public`.
  - `npm-dependencies.md`: `package.json` düzenlenince yüklenir. Cooldown, lockfile, npm 11 `allowScripts` ve TypeScript'in 6.0.x'te tutulması (TypeScript 7'de JS API yok).
- **Bundle bütçesi:** `.github/scripts/bundle-budget.mjs`, `verify --full`'da build'den sonra çalışır. Gzip'li JS bütçeyi aşarsa kırmızıya döner. Varsayılan bütçe: en büyük chunk 200 KB, toplam 600 KB. Bütçe `web.budget`'ta durur; değiştirmek incelemeli bir karardır.
- **Formatter, verify adımları, `npm` Dependabot girdisi (14 gün cooldown) ve `typescript-language-server`:** stack-node ile aynı sözleşme ([ADR-0006](../../docs/adr/0006-stack-sozlesmesi.md)). İki plugin birlikte kurulursa aynı LSP'yi kaydederler; Claude Code birini kullanır.
- **`.vue` için LSP:** `typescript-language-server`, projenin `@vue/typescript-plugin` paketini yükleyerek `.vue` dosyalarında da tip bilgisi verir. `vue-language-server` tek başına Claude Code'da çalışmıyor: VS Code istemcisinin aktardığı `tsserver/request` mesajlarını bekliyor ve her istek 60 sn'de zaman aşımına düşüyor (gerçek oturumda denendi, 2.1.326). İlk istek proje yüklenirken `any` dönebilir.
- **CI:** `@playwright/test` olan pakette `ci.yml`'e tarayıcı kurulum adımı ([ADR-0010](../../docs/adr/0010-stack-sozlesmesi-v2.md)).

## Skill'ler

| Skill | Nasıl çağrılır | Ne yapar |
| --- | --- | --- |
| `setup` | `/stack-web:setup` | Sözleşmeyi projeye add-only uygular. |
| `scaffold` | `/stack-web:scaffold` | Resmî araçla (pinli sürüm) Next.js, Vite + React, Vue 3 + Vite ya da Nuxt uygulaması kurar ve sertleştirir. |
| `upgrade-deps` | `/stack-web:upgrade-deps` | 14 gün cooldown, major'lar tek tek, framework yükseltme rehberleriyle. |
| `test` | Otomatik | Testing Library ile bileşen, Playwright ile uçtan uca testler. |
| `perf-budget` | Otomatik | Bundle bütçesi aşımının kökünü bulur, Core Web Vitals kontrolü yapar. |

## Kurulum

Önce `/core:init` ve `/governance:setup`. UI'lı projelerde `design` plugin'ini de kurun.

```bash
claude plugin install stack-web@ideal-agentic-env --scope project
```

Sonra `/stack-web:setup`. Plugin güncellendikten sonra `/stack-web:setup --refresh`.
