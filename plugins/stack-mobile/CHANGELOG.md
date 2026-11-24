# Changelog — stack-mobile

## 0.1.1

- Deneysel olarak etiketlendi (marketplace açıklaması `[experimental]`, README durum satırı); [ADR-0012](../../docs/adr/0012-v1-surum-sozu.md).

- Ortak setup kütüphanesi (`stack-lib.mjs`) güncellendi: Maven/Gradle manifestleri, `dependencyPrefixes` koşulu, platforma göre verify komutu, koşullu Dependabot girdisi. LSP kontrolü binary'yi artık çalıştırmıyor, PATH'te arıyor. Bu plugin'in davranışı değişmedi.

## 0.1.0

- İlk sürüm: React Native ve Expo profilleri, `react-native.md` ve `expo.md` kuralları, ortak `npm-dependencies.md`.
- `setup`: formatter, verify adımları (`expo:check`, `expo:export` dahil), `npm` Dependabot girdisi, güvenli depolama ipucu, `typescript-language-server` kontrolü.
- Skill'ler: `scaffold` (create-expo-app), `test` (jest-expo), `upgrade-deps` (SDK major major), `device-verify` (iOS simulator ve Android emulator ekran görüntüleri, `device-shots.mjs`).
- `expo:check` `EXPO_OFFLINE=1` ile çalışır: çevrimiçi `expo install --check` her paketin en yeni yamasını istiyor ve 14 günlük cooldown'u bozuyor; çevrimdışı mod kurulu SDK'nın listesine bakıyor (örnek repoda bulundu).
- `device-shots.mjs` iOS'ta alınan görüntüleri doğru sayar (gerçek simulator'da denendi: Expo Go, iOS 17.5, light ve dark).
- Native iOS ve Android profilleri Faz 5'e bırakıldı.

## 0.0.1

- İskelet oluşturuldu (Faz 0).
