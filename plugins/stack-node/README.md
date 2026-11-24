# stack-node

> **Durum:** Stabil, 1.0.0.

Node.js ve TypeScript backend'leri için stack plugin'i: Node, Fastify ve NestJS.

## Ne yapar?

- **Kurallar (path-scoped):** `/stack-node:setup`, projede algıladığı backend paketleri için kuralları `.claude/rules/stack-node/` altına yazar. Her kural dosyası yalnız ilgili paketin dosyalarına dokunulunca yüklenir. Frontend paketine (React, Next, Vue…) Node kuralı yüklenmez.
  - `node.md`: strict TS, sınırda zod ile doğrulama, floating promise yasağı, parametreli SQL, timeout'lar, PII'siz log ve sessiz bozan tuzaklar.
  - `fastify.md` / `nest.md`: framework'e özgü desenler (şema, auth, hata eşleme, health, graceful shutdown).
- **Formatter:** projede `prettier` ya da `@biomejs/biome` varsa core'un `format-dispatch` hook'una kaydedilir.
- **Verify:** kök `package.json`'daki `typecheck`, `lint`, `test:unit`, `test`, `build` script'leri `scripts/verify.mjs` adımlarına eklenir.
- **Dependabot:** `npm` ekosistemi 14 günlük cooldown ile eklenir. Lockfile'lar zaten governance'ın OSV-Scanner taramasına giriyor.
- **LSP:** `typescript-language-server` (kurulu değilse setup kurulum komutunu söyler).

## Skill'ler

| Skill | Nasıl çağrılır | Ne yapar |
| --- | --- | --- |
| `setup` | `/stack-node:setup` | Sözleşmeyi (`stack.json`) projeye add-only uygular. |
| `scaffold` | `/stack-node:scaffold` | Yeni bir Fastify (ya da NestJS) servisi kurar. |
| `upgrade-deps` | `/stack-node:upgrade-deps` | Bağımlılıkları 14 günlük cooldown'a uyarak, major'ları tek tek yükseltir. |
| `test` | Otomatik | Unit, route ve gerçek veritabanıyla integration testleri. |
| `api-endpoint` | Otomatik | Şemalı, yetkili, sayfalı ve testli endpoint ekler veya değiştirir. |

`setup`, `scaffold` ve `upgrade-deps` yalnız elle çağrılır. Açıklamaları her oturumda context'e girmez.

## Kurulum

Önce `/core:init` ve `/governance:setup` çalışmış olmalı.

```bash
claude plugin install stack-node@ideal-agentic-env --scope project
```

Sonra Claude Code içinde `/stack-node:setup`. Plugin güncellendikten sonra `/stack-node:setup --refresh` yönetilen kural dosyalarını günceller. Projeye özel kurallar `.claude/rules/` altında başka dosyalarda durur; setup onlara dokunmaz.
