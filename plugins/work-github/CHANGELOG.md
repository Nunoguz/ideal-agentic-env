# Changelog — work-github

## 1.0.0

- Stabil: 1.x içinde kırıcı değişiklik yok; kırıcı her değişiklik major sürüm ve göç notuyla gelir ([ADR-0012](../../docs/adr/0012-v1-surum-sozu.md)). 0.1.1'ın üzerine yalnız bu bölümdeki maddeleri getirir.

## 0.1.1

- `setup`: Skill metni, dosyaları script'in yazdığını ve bu yüzden core hook'larının onay sormadığını doğru anlatıyor. Dry run, script'in ek bilgilerini (iş kaynağı) de yazdırır.

## 0.1.0

- Ortak iş şeması. GitHub issue'ları ve yerel PBI'lar aynı bölümleri kullanır: tür, bağlam, test edilebilir kabul kriterleri, kapsam dışı, riskler, test planı, compliance etkisi.
- `/work-github:setup`:
  - issue formunu (`.github/ISSUE_TEMPLATE/work-item.yml`) ve `docs/pbi/` klasörünü kurar,
  - varsayılan iş kaynağını config'e yazar,
  - onay alındıktan sonra eksik label'ları oluşturur.
- Skill'ler:
  - `write-issue`: talebi şemaya uygun bir işe çevirir.
  - `take-issue`: işi kontrol eder, sahiplenir, branch açar ve planlamaya geçirir.
  - `pr`: branch'i push eder ve işe bağlı bir PR açar. Merge etmez.
  - `triage`: backlog'u şemaya karşı değerlendirir. Değişiklikleri yalnız onayla uygular.
- `pbi.mjs`: yerel PBI'ları deterministik biçimde numaralandırır, listeler ve durumlarını günceller.
- GitHub işlemleri `gh` CLI ile yapılır, MCP gerekmez.
