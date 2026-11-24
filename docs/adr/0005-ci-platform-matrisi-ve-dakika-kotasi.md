# ADR-0005: Repo CI'ında macOS bacağını PR'lardan çıkarmak

- **Durum:** Kabul edildi
- **Tarih:** 2026-11-23
- **Değiştirdiği karar:** [ADR-0002](0002-cok-platformlu-hook-tasarimi.md) madde 7

## Bağlam

[ADR-0002](0002-cok-platformlu-hook-tasarimi.md), bu reponun `validate` workflow'unun her çalışmada `ubuntu`, `windows` ve `macos` üzerinde koşmasını istiyor.

Repo private ve GitHub Free planında ([ADR-0003](0003-free-planda-yasa-katmani.md)). Bu planda aylık bir Actions dakika kotası var. Faturalandırma her job'ı dakikaya yukarı yuvarlıyor ve işletim sistemine göre çarpan uyguluyor: Linux 1x, Windows 2x, macOS 10x.

Faz 2 sonundaki job süreleri (2026-11-23):

| Job | Süre | Faturalanan |
| --- | --- | --- |
| Repo rules and tests (ubuntu) | ~10 sn | 1 dk |
| Repo rules and tests (windows) | ~40 sn | 2 dk |
| Repo rules and tests (macos) | ~10 sn | **10 dk** |
| `claude plugin validate --strict` | ~10 sn | 1 dk |
| security | ~30 sn | 1 dk |
| compliance | ~7 sn | 1 dk |

Bir PR push'u yaklaşık 16 dakika faturalanıyor ve bunun 10 dakikası macOS. Faz 3'te push sayısı artacak.

Gerçek aylık kullanımı okuyamadık: billing API'si `user` scope'u istiyor. Rakamlar job sürelerinden hesaplandı.

Platform farklarının riski eşit değil:

- **Windows** gerçekten farklı. Yol ayırıcısı, PowerShell ve `.cmd` çalıştırma, satır sonları farklı. Hook'ların kırılma ihtimali en yüksek burada.
- **macOS** POSIX. Node davranışı Linux'a çok yakın. Farklar dosya sisteminin büyük/küçük harf duyarsızlığı ve BSD araçlarıyla sınırlı. Hook'larımız harici araç çağırmıyor ([ADR-0002](0002-cok-platformlu-hook-tasarimi.md) madde 2).

## Karar

1. PR'larda `validate` yalnız **ubuntu ve windows** üzerinde koşar.
2. macOS bacağı şu durumlarda koşar:
   - `main`'e her push'ta
   - haftalık (`schedule`)
   - elle (`workflow_dispatch`)
3. `concurrency` grubu olay türünü de içerir. Böylece zamanlanmış bir çalışma, `main` push'unun çalışmasını iptal etmez.
4. Projelere gönderdiğimiz CI şablonları bu karardan etkilenmez. Onlar zaten tek bir ubuntu job'ıyla sınırlı ([ADR-0003](0003-free-planda-yasa-katmani.md)).

## Sonuçlar

**Olumlu**

- PR push'u başına faturalanan süre yaklaşık 16 dakikadan 6 dakikaya iner.
- Windows, yani en riskli platform, her PR'da sınanmaya devam eder.

**Olumsuz ve riskler**

- macOS'a özgü bir hata PR'da değil, merge'den sonra `main`'de görünür. Bu bir tespit edici kontroldür: `validate` main'de kırmızıya döner ve bir sonraki PR düzeltir.
- change-audit, PR head'indeki kontrollere bakar. macOS bacağı orada olmadığı için change-audit'in "yeşil kontrol" şartını etkilemez.

## Değerlendirilen alternatifler

- **Üç platform her PR'da:** Bugünkü durum. Kota Faz 3'te hızla tükenir.
- **macOS'u tamamen kaldırmak:** Takımda macOS kullanan geliştiriciler var. Haftalık ve main çalışmaları ucuz bir güvence.
- **Yalnız hook dosyaları değiştiğinde macOS (`paths` filtresi):** Matris bacağını yola göre açıp kapatmak ek bir job ve karmaşıklık getirir. Paylaşılan kod `shared/` altında olduğu için yol listesi kolayca eskir.

## Bağlantılar

- [ADR-0002](0002-cok-platformlu-hook-tasarimi.md), [ADR-0003](0003-free-planda-yasa-katmani.md), `.github/workflows/validate.yml`
