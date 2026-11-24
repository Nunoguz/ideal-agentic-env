# ADR-0002: Hook'lar Windows, macOS ve Linux'ta aynı çalışacak

- **Durum:** Kabul edildi. Madde 7'yi [ADR-0005](0005-ci-platform-matrisi-ve-dakika-kotasi.md) değiştirdi.
- **Tarih:** 2026-11-23

## Bağlam

Takımda Windows kullananlar var. Claude Code, shell-form hook komutlarını POSIX sistemlerde bash ile, Git Bash olmayan Windows'ta ise PowerShell ile çalıştırıyor. Bu yüzden tırnaklama, yol ayırıcısı ve kullanılabilir araçlar (`jq`, `grep`) platforma göre değişiyor. Üstelik Windows'ta Claude'un shell aracı `Bash` değil `PowerShell` olabiliyor, yani tehlikeli komutların sözdizimi de farklı.

## Karar

1. **Hook'lar exec-form çalışır.** `"command": "node"` ve `"args": ["${CLAUDE_PLUGIN_ROOT}/hooks/<hook>.mjs"]` biçiminde tanımlanır. Arada bir shell olmadığı için tırnaklama ve yol sorunları ortadan kalkar.
2. **Hook'lar bağımlılığı olmayan Node.js (>= 20) scriptleridir.** `jq`, `grep` gibi araçlara güvenilmez. Yollar `node:path` ile çözülür ve eşleştirme için `/` ayırıcısına normalize edilir.
3. **Güvenlik hook'ları fail-closed çalışır.** `onFailure: "block"` ayarlanır ve script içindeki her hata engelleme kararına çevrilir. Kolaylık hook'ları (format, audit, bağlam) fail-open çalışır: hata kaydedilir, işlem devam eder.
4. **Karar üç kademelidir:**
   - **deny:** felaket sınıfı işlemler (kök dizini silme, indirilen script'i doğrudan çalıştırma, merge edilmiş migration'ı değiştirme, bilinen formatta secret yazma).
   - **ask:** meşru ama riskli işlemler (geçmişi yeniden yazma, korumalı dosyaya yazma, veri silen SQL). Bu durumda insan onayı istenir.
   - **izin:** geri kalan her şey. Burada son sözü normal izin sistemi söyler.
5. **Shell guard'ları hem `Bash` hem `PowerShell` aracını eşler.** PowerShell ve cmd'ye özgü tehlikeli kalıpları da tanır.
6. **Projede doğrulama `scripts/verify.mjs` üzerinden yapılır.** Bu, adımları projenin config dosyasından okuyan çok platformlu bir çalıştırıcıdır. Bash script'i kullanılmaz.
7. **Repo CI'ı `ubuntu`, `windows` ve `macos` üzerinde koşar.** `.gitattributes` satır sonlarını LF'ye sabitler. PR'larda macOS bacağı koşmaz ([ADR-0005](0005-ci-platform-matrisi-ve-dakika-kotasi.md)).

## Sonuçlar

**Olumlu**

- Hook'lar tek kod tabanıyla üç platformda aynı davranır.
- Her hook birim testleriyle doğrulanabilir.

**Olumsuz**

- Node 20 veya üstü her geliştirici için ön koşul olur. `core:init` bunu kontrol eder. Node yoksa fail-closed guard'lar her araç çağrısını engeller. Bu bilerek seçilmiş bir davranış: korumasız çalışmaktansa durmak daha iyi.
- Kalıp tabanlı komut tanıma her varyantı yakalayamaz. Bu yüzden guard'lar bir güvenlik ağıdır, sınır değildir. Asıl sınır CI ve branch protection'dır (Yasa katmanı).
