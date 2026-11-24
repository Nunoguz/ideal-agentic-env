# ADR-0012: v1.0 sürüm sözü ve olgunluk etiketi

- **Durum:** Kabul edildi
- **Tarih:** 2026-11-24
- **Genişlettiği karar:** [ADR-0001](0001-marketplace-mimarisi.md) (plugin başına semver)

## Bağlam

Faz 0–4'te bütün plugin'ler 0.x'teydi. 0.x'te her minor sürüm kırıcı olabilir, bu yüzden takım arkadaşları bir güncellemeden sonra projelerinin bozulup bozulmayacağını bilemiyordu. Faz 5'in amacı, bu ortamı takımın güvenle kullanabileceği hale getirmek.

Plugin'lerin olgunluğu da aynı değil. Bazıları gerçek örnek projelerde uçtan uca kanıtlandı:

- iae-sample-fullstack,
- iae-sample-dotnet-vue,
- bu repodaki fixture CI'ı.

Bazılarının ise bir kısmı hiç sınanmadı. Örneğin stack-mobile'da giriş sonrası ekranlar ve native build doğrulanmadı, devops-selfhosted'ın Kubernetes profili hiçbir projede denenmedi.

## Karar

### 1. İki etiket

| Etiket | Sürüm | Anlamı |
| --- | --- | --- |
| **Stabil** | ≥ 1.0.0 | Gerçek bir örnek projede ya da fixture CI'ında uçtan uca kanıtlandı. Aşağıdaki semver sözü geçerli. |
| **Deneysel** | 0.x | Kanıtı eksik. Davranış ve dosyalar haber verilmeden değişebilir. Marketplace açıklaması `[experimental]` ile başlar, README'nin durum satırı "Deneysel" der. |

Stabil bir plugin'in sınanmamış bir parçası varsa (devops-selfhosted'ın Kubernetes profili, stack-java-spring'in Gradle desteği), README o parçayı açıkça "deneysel" diye adlandırır. Böyle bir parça semver sözünün dışındadır.

### 2. Semver sözü (stabil plugin'ler)

**Kırıcı değişiklik:** bir projenin güncellemeden sonra elle bir şey yapmadan çalışmayı sürdüremediği her değişiklik. Örnekler:

- bir skill'in adı ya da argümanları,
- `stack.json` sözleşmesi ve `.claude/ideal-agentic-env.json` anahtarları,
- `ci.yml` bölgelerinin işaretleri,
- yönetilen dosyaların yolu,
- bir hook'un daha önce izin verdiği bir şeyi engellemesi,
- governance kapısının yeşil bir projeyi kırmızıya çevirmesi.

**Sürüm kuralları:**

- **Major:** her kırıcı değişiklik. CHANGELOG'da bir **göç notu** zorunlu: ne değişti, projede ne yapılmalı (genellikle `/<plugin>:setup --refresh`).
- **Minor:** geriye uyumlu yeni yetenek (yeni profil, yeni skill, yeni kural).
- **Patch:** hata düzeltmesi ve metin iyileştirmesi.

**Güvenlik istisnası:** bir güvenlik düzeltmesi, kırıcı olsa bile, patch ya da minor sürümde gelebilir. CHANGELOG bunu "güvenlik" başlığıyla ve göç notuyla söyler.

### 3. Yasa katmanı

`npm run validate` şunları denetler:

- `0.x` bir plugin'in marketplace açıklaması `[experimental]` ile başlar ve README'si "Deneysel" der.
- `≥ 1.0.0` bir plugin'in açıklaması `[experimental]` ile başlamaz.
- Her sürüm değişikliğinin CHANGELOG'da bir bölümü vardır (zaten vardı).

Göç notunun varlığı bugün metinle ve PR incelemesiyle korunuyor, CI ile değil. Major sürüm alan ilk değişiklikte validate'e eklenecek.

### 4. Faz 5'teki sınıflandırma

- **Stabil (1.0.0):** core, governance, work-github, design, data-sql, stack-web, stack-node, stack-dotnet, stack-java-spring, devops-selfhosted.
- **Deneysel:**
  - stack-mobile (0.1.x),
  - devops-selfhosted'ın Kubernetes profili,
  - stack-java-spring'in Gradle desteği,
  - bulut plugin şablonu ([YENI-BULUT-EKLEME.md](../YENI-BULUT-EKLEME.md)).
- **Katalogdan çıkarıldı:** içi boş olan stack-python ve data-nosql. Bir proje isteyince `scripts/new-plugin.mjs` ile yeniden açılırlar ([PLAN §8.3](../PLAN.md)).

## Sonuçlar

**Olumlu**

- Takım arkadaşı hangi plugin'e güvenebileceğini katalogdan görüyor.
- Güncellemelerin kırıcı olup olmadığı sürüm numarasından okunuyor.
- Deneysel parçalar stabil olanları bekletmiyor.

**Olumsuz**

- Her kırıcı değişiklik major sürüm ve göç notu demek, yani daha çok yazı işi.
- Bir plugin'i "stabil" yapan kanıtın (örnek repo ya da fixture) yaşaması gerekiyor. Fixture CI'ı haftalık koşuyor; örnek repolar elle güncelleniyor.
