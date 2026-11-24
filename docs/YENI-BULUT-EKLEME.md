# Yeni bir bulut plugin'i eklemek

Kendi sunucuda çalışan projelerin ihtiyaçları `devops-selfhosted`'da: container, Compose, Kubernetes, deploy, secret, gözlemlenebilirlik ve yedek. Bir bulut sağlayıcısı (AWS, Azure, Google Cloud) bunların üzerine kendi plugin'iyle gelir. Bu rehber o plugin'in nasıl ekleneceğini anlatır.

## 1. İskeleti üret

```bash
node scripts/new-plugin.mjs --kind cloud --name cloud-aws --provider "AWS" --cli aws
```

Komut şunları yapar:

- `templates/cloud-plugin/` şablonundan `plugins/cloud-aws/` klasörünü üretir.
- Plugin'i `.claude-plugin/marketplace.json`'a ekler.
- Ortak setup script'lerini `shared/manifest.json`'a kaydeder ve kopyalar.

İskelet 0.0.1 sürümüyle gelir; validate bu sürümü sözleşmeden muaf tutar. Önce `--dry-run` ile neyin oluşacağını görebilirsin.

## 2. Sözleşmeyi doldur

0.1.0'dan itibaren `npm run validate` iki şeyi zorlar:

- Altı skill bulunmalı: `setup`, `deploy`, `secrets`, `iac`, `observability` ve `cost-guard`.
- `stack.json` → `config.guardedCommands` en az bir girdi içermeli ve her desen geçerli bir regex olmalı.

| Parça | İçerik |
| --- | --- |
| `rules/cloud.md` | Kimlik ve erişim (en az yetki, uzun ömürlü anahtar yok, CI'dan OIDC), ağa açıklık, şifreleme, maliyet etiketleri, bölge ve veri yerleşimi (KVKK), sağlayıcının sessizce bozan tuzakları. |
| `stack.json` → `profiles` | Kuralların yükleneceği dosyalar: `infra/**`, `*.tf`, `Pulumi.yaml` ya da sağlayıcının kendi dosyaları. |
| `stack.json` → `config.guardedCommands` | Sağlayıcı CLI'ının yıkıcı komutları. Setup bunları projenin config'ine ekler; core'un shell-guard'ı bu komutlardan önce onay ister (`ask`) ya da reddeder (`deny`). |
| `deploy` (yalnız slash komutu) | Ön kontroller, önce migration, kesintisiz rollout, smoke test, geri dönüş. Hesaba dokunan her adım insan onaylı. |
| `secrets` | Sağlayıcının secret store'u, anahtar yerine workload identity, CI'dan OIDC, rotasyon. |
| `iac` | Önce plan, diff incelemesi, kilitli uzak state, konsoldan elle değişiklik yok, drift kontrolü. `apply` yalnız kullanıcının onayıyla. |
| `observability` | Telemetrinin nereye gittiği, saklama süresinin governance'ın retention politikasıyla uyumu, belirti odaklı alarmlar. |
| `cost-guard` | Bütçe ve alarmlar, zorunlu etiketler, değişiklikten önce maliyet tahmini, boşta duran kaynakların temizliği. |

### Örnek `guardedCommands`

Komut parçası `program arg arg` biçiminde, büyük/küçük harfe duyarsız eşleşir.

```json
[
  { "pattern": "^aws s3 (rb|rm)\\b.*--recursive|^aws s3 rb\\b", "decision": "ask", "reason": "deleting S3 data" },
  { "pattern": "^aws (ec2 terminate-instances|rds delete-db-instance|cloudformation delete-stack)\\b", "decision": "ask", "reason": "deleting AWS resources" },
  { "pattern": "^az (group|vm|sql|storage account) delete\\b", "decision": "ask", "reason": "deleting Azure resources" },
  { "pattern": "^gcloud .*\\b(delete|reset)\\b", "decision": "ask", "reason": "deleting or resetting Google Cloud resources" },
  { "pattern": "^(aws|az|gcloud) .*\\b(secretsmanager get-secret-value|keyvault secret show|secrets versions access)\\b", "decision": "ask", "reason": "printing a cloud secret into the session" }
]
```

`terraform destroy`, `apply -auto-approve`, `kubectl delete` ve `helm uninstall` için core'da zaten kural var. Bunları tekrar yazmaya gerek yok.

## 3. CI'a giriş (opsiyonel)

CI'dan bulut hesabına erişim gerekiyorsa uzun ömürlü anahtar yerine OIDC kullan. Kimlik doğrulama adımı bir CI parçası olarak eklenir ([ADR-0010](adr/0010-stack-sozlesmesi-v2.md)):

1. Adımı `plugins/cloud-aws/ci/auth.yml` dosyasına yaz.
2. `stack.json` → `ci.steps` altına ekle.
3. Kullandığın action'ı tam commit SHA'sına pinle ve `.github/workflows/action-pins.yml`'e ekle. Böylece Dependabot onu da günceller.
4. Workflow'a `permissions: id-token: write` gerekir. Bu izni projenin `ci.yml` dosyasında ve kullanıcının onayıyla ver.

## 4. Kabul politikası

Yeni bir araç ya da action (ör. `aws-actions/configure-aws-credentials`, `infracost`) doğrudan eklenmez:

- önce incelenir,
- sürümü ve sha256'sı ya da commit SHA'sı ile sabitlenir,
- gerekçesi bir ADR'ye yazılır (CLAUDE.md, "Admission policy").

Bir CLI işi görüyorsa MCP server'a tercih edilir.

## 5. Yayımla

1. `plugin.json` → `"version": "0.1.0"`. `CHANGELOG.md`'ye `## 0.1.0` bölümünü yaz.
2. `README.md`'yi doldur (Türkçe).
3. `npm run check` yeşil olmalı. CI'da `claude plugin validate . --strict` da çalışır.
4. Örnek bir projede gerçek bir Claude oturumuyla dene. `claude -p "/cloud-aws:setup" --plugin-dir plugins/cloud-aws` komutu bunun için yeterli. Projeyi değiştiren skill'ler yalnız slash komutuyla çalışır.
5. PR aç. Merge, bütün kontroller yeşilken ve repo sahibinin açık onayıyla yapılır.
