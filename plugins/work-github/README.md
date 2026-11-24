# work-github

> **Durum:** Stabil, 1.0.0.

İşin sisteme girişi ve PR'a kadar yolu. GitHub Issues ile repodaki yerel PBI dosyaları (`docs/pbi/`) **aynı şemayı** kullanır, skill'ler de ikisini aynı akışla işler. GitHub işlemleri `gh` CLI ile yapılır. MCP gerekmez, bu da context'i ve saldırı yüzeyini küçük tutar.

## Kurulum

```bash
claude plugin install work-github@ideal-agentic-env --scope project
```

Sonra projede `/work-github:setup` çalıştır. Bu komut:

- issue formunu ve `docs/pbi/` klasörünü kurar,
- varsayılan iş kaynağını (`github` ya da `pbi`) `.claude/ideal-agentic-env.json`'a yazar,
- onay verirsen eksik label'ları oluşturur.

## Akış

```
write-issue → take-issue → core:plan → core:implement → core:pre-pr → pr → (insan merge eder)
```

| Skill | Ne zaman |
| --- | --- |
| `/work-github:setup` | Projeye kurarken (yalnız elle çağrılır) |
| `write-issue` | "Şunu issue yap", "bu bug'ı kaydet", "backlog'a ekle" |
| `take-issue` | "#42'yi al", "PBI-0007 üzerinde çalış", "sıradaki hazır işi al" |
| `pr` | "PR'ı aç", "push edip pull request oluştur" |
| `triage` | "Backlog'u triage et", "hangi işler hazır" |

Dışarıya dokunan her adım önce onay ister: issue açmak, sahiplenmek, label eklemek, push ve PR. Merge her zaman insanın kararıdır.

## İş şeması

Ayrıntı: [`skills/write-issue/references/work-item.md`](skills/write-issue/references/work-item.md).

| Bölüm | Zorunlu |
| --- | --- |
| Başlık (`<tür>: <sonuç>`) ve tür (`feature`, `bug`, `chore`, `spike`) | ✅ |
| Bağlam | ✅ |
| Kabul kriterleri (test edilebilir checkbox'lar) | ✅ |
| Kapsam dışı, riskler, test planı | |
| Compliance etkisi (kişisel veri, üçüncü taraf ya da yurt dışına aktarım, saklama veya erişim, güvenlik kontrolü) | ✅ |

İş kaydına kişisel veri, müşteri adı, secret ya da üretim verisi yazılmaz.

## Yerel PBI'lar

```bash
node plugins/work-github/skills/write-issue/scripts/pbi.mjs new --title "CSV dışa aktarım" --type feature
node plugins/work-github/skills/write-issue/scripts/pbi.mjs list --status ready
node plugins/work-github/skills/write-issue/scripts/pbi.mjs set PBI-0001 --status in-progress
```

Skill'ler bu script'i kendileri çağırır. Yukarıdaki komutlar elle kullanım içindir.
