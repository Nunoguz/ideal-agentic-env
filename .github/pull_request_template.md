## Ne değişti, neden?

<!-- Kısa özet. İlgili ADR veya issue varsa bağla. -->

## Etkilenen plugin'ler ve sürümler

| Plugin | Eski → Yeni sürüm | Kırıcı mı? |
| --- | --- | --- |
|  |  |  |

## Kontrol listesi

- [ ] `npm run check` yerelde yeşil
- [ ] Her değişen plugin için `plugin.json` sürümü artırıldı ve `CHANGELOG.md` girdisi eklendi
- [ ] Kırıcı değişiklikse major sürüm artırıldı ve göç notu yazıldı
- [ ] Yeni hook varsa engelleme ve izin verme yolları için testleri var; fail-closed/fail-open kararı belirtildi
- [ ] Yeni always-on içerik (skill açıklaması, enjekte edilen metin) varsa context maliyeti gerekçelendirildi
- [ ] Üçüncü taraf içerik varsa incelendi, repoya alındı ve ADR yazıldı
- [ ] Kişisel veri işleyen bir değişiklik yok ya da veri envanteri güncellendi (compliance gate bu kutuyu beyan olarak okur)
