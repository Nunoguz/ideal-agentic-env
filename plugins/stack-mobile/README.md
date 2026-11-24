# stack-mobile

> **Durum:** Deneysel, 0.1.1. React Native ve Expo. Giriş sonrası ekranlar simulator'da ve native iOS/Android build doğrulanmadı; davranış ve dosyalar 1.0'a kadar haber verilmeden değişebilir ([ADR-0012](../../docs/adr/0012-v1-surum-sozu.md)). Native iOS (Swift/SwiftUI) ve Android (Kotlin/Compose) profilleri bir proje isteyince gelecek.

## Ne yapar?

- **Kurallar (path-scoped):** `/stack-mobile:setup`, algıladığı uygulama paketleri için kuralları `.claude/rules/stack-mobile/` altına yazar.
  - `react-native.md`: büyüyen veri için `FlatList`, design token'larından tema ve dark mode, dört veri durumu ve çevrimdışı hal, erişilebilirlik (rol, etiket, 44/48 dokunma alanı, büyük yazı), token'ların Keychain/Keystore'da tutulması, bundle'a giren her şeyin herkese açık olması, deep link'lerin güvenilmeyen girdi sayılması.
  - `expo.md`: native paketlerin sürümüne SDK karar verir (`npx expo install`), typed `app.config.ts`, yalnız `EXPO_PUBLIC_*`, EAS secret'ları, OTA güncellemelerinin sınırı (`runtimeVersion` fingerprint), izin açıklamaları, gizlilik manifesti, Play veri güvenliği, uygulama içinden hesap silme.
  - `npm-dependencies.md`: stack-node ve stack-web ile ortak.
- **Verify:** `fast`'te `typecheck`, `lint`, `test:unit`; `full`'da `test`, `expo:check` (`expo install --check`) ve `expo:export` (iOS ve Android bundle'ları native build olmadan, ubuntu'da ucuz). Adımlar kök `package.json`'da o script varsa eklenir.
- **Cihaz doğrulaması:** `device-verify` skill'i ve `device-shots.mjs`. iOS simulator'da ve Android emulator'da her ekranı deep link'le açar, light ve dark modda ekran görüntüsü alır. CI'da native build yok; cihaz doğrulaması yereldir.
- **İpucu:** Expo projesinde güvenli depolama kütüphanesi yoksa setup bunu söyler.

## Skill'ler

| Skill | Nasıl çağrılır | Ne yapar |
| --- | --- | --- |
| `setup` | `/stack-mobile:setup` | Sözleşmeyi projeye add-only uygular. |
| `scaffold` | `/stack-mobile:scaffold` | `create-expo-app` (pinli sürüm) ile expo-router uygulaması kurar ve sertleştirir. |
| `upgrade-deps` | `/stack-mobile:upgrade-deps` | Expo SDK'yı major major, diğer paketleri 14 gün cooldown'la yükseltir. |
| `test` | Otomatik | jest-expo ve Testing Library ile bileşen testleri. |
| `device-verify` | Otomatik | Simulator ve emulator'da light/dark ekran görüntüleri ve inceleme. |

## Kurulum

Önce `/core:init` ve `/governance:setup`.

```bash
claude plugin install stack-mobile@ideal-agentic-env --scope project
```

Sonra projede `/stack-mobile:setup` çalıştır.
