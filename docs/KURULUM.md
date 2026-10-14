# Kurulum – senin yapman gerekenler

Durum (2026-10-14):
- ✅ Firebase projesi `varselliste-no` (görünen ad: Varsellisten), **Blaze**
- ✅ Firestore `(default)` **europe-north1** (CLI ile oluşturuldu; ad ve konum doğrulandı)
- ✅ Fonksiyonlar **europe-west1**'de (Cloud Scheduler europe-north1/north2'de yok), 8 zamanlanmış fonksiyon
- ✅ Artifact Registry temizlik kuralı (1 günden eski imajlar silinir)
- ✅ GitHub reposu: https://github.com/tutenstein/varselliste-no
- ⏳ **Açık:** bütçe uyarısı (adım 1), deploy hesabı ve `FIREBASE_SERVICE_ACCOUNT` (adım 2, Faz 5), iletişim adresi ve alan adı (adım 3)

Hiçbir kaynak API anahtarı gerektirmiyor; Secret Manager'da şu an gizli bilgi yok.

---

## 1. Bütçe uyarısı (önerilir)

Google Cloud Console → **Billing → Budgets & alerts** → aylık 10 € gibi bir bütçe ve %50/%90/%100 uyarıları.

Beklenen maliyet: ücretsiz kotalar içinde kalmalı.
- Cloud Scheduler: 3 iş ücretsiz, kalan 5 iş toplam ayda ~0,50 $
- Firestore: yazımlar değişen olay sayısıyla ölçeklenir (içerik hash'i ile değişmeyen yazımlar atlanır); ziyaretçi başına tek okuma
- Cloud Functions / Cloud Run: ücretsiz kota içinde

## 2. GitHub Actions için deploy hesabı (Faz 5'te)

1. https://console.cloud.google.com/iam-admin/serviceaccounts?project=varselliste-no → **Create service account**, ad: `github-deploy`
2. Roller (yalnızca `firebase deploy --only functions,firestore,hosting` için gerekenler):

   | Rol | Neden |
   |---|---|
   | Cloud Functions Developer | Fonksiyonları oluşturmak ve güncellemek |
   | Service Account User | Fonksiyonu çalışma hesabı adına deploy etmek |
   | Cloud Scheduler Admin | Zamanlayıcıları oluşturmak ve güncellemek |
   | Secret Manager Viewer | CLI, fonksiyonların gizli bilgilere erişimini kontrol ediyor (şu an gizli bilgi yok, ama CLI soruyor) |
   | Firebase Rules Admin | `firestore.rules` yüklemek |
   | Cloud Datastore Index Admin | `firestore.indexes.json` yüklemek |
   | Service Usage Consumer | CLI, gerekli API'lerin açık olduğunu kontrol ediyor |
   | Artifact Registry Reader | CLI, imaj temizlik kuralını kontrol ediyor |
   | Firebase Hosting Admin | Web sitesini yayınlamak |

3. Hesabı aç → **Keys → Add key → Create new key → JSON**.
4. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret** → Name: `FIREBASE_SERVICE_ACCOUNT`, Value: JSON dosyasının tüm içeriği.
5. İndirilen JSON dosyasını bilgisayarından **sil**; repoya koyma (`.gitignore` bu dosyaları zaten dışarıda tutuyor).

## 3. Canlıya çıkmadan önce

- **İletişim adresi.** `functions/.env` içindeki `INGEST_USER_AGENT` yer tutucusunu (`kontakt: TODO`) gerçek bir e-posta veya site adresiyle değiştir. MET Norway, iletişim bilgisi olmayan istemcileri uyarısız engelleyebiliyor. Aynı adres "Om" sayfasında **kaldırma talepleri** için de kullanılacak (suç kategorileri gösterildiği için).
- **Alan adı.** `.no` için Enhetsregisteret kaydı (yabancı şirket NUF olarak da olur) ve Norveç posta adresi gerekiyor. Bkz. [veri-kaynaklari.md §6](veri-kaynaklari.md).

## 4. İsteğe bağlı e-postalar

- `politiloggen@politiet.no`: kullanımı bildirmek ve uygun yoklama sıklığını sormak (hız sınırı belgelenmemiş; şu an 3 dakikada bir).
- `datex@vegvesen.no`: WFS'nin bu amaçla 2 dakikada bir kullanımının uygun olduğunu ve DATEX şartlarının WFS için de geçerli olup olmadığını teyit etmek.
- DSB: Nødvarsel için yapılandırılmış (CAP/JSON) akış; BRIS verisi.

## İsteğe bağlı

- Yerel Firebase CLI eski (13.34); komutlar `npx firebase-tools@15 …` ile çalıştırılıyor. Güncellemek için:

```bash
npm install -g firebase-tools
```

---

## Backfill'i ve akışları yeniden kurmak

- **Politiloggen geçmişi:** `functions/src/jobs.ts` içinde `BACKFILL_VERSION` değerini artır ve deploy et. Sonraki çalıştırmalar `BACKFILL_DAYS` (30) günü günde bir çağrıyla yeniden çeker.
- **Site akışları:** `functions/src/feeds.ts` içinde `FEED_VERSION` değerini artır ve deploy et. Sonraki çalıştırma akışları baştan kurar.
- **Kommune değişiklikleri** (bilinen sonraki: 1.1.2028, Vest-Lofoten ve Gran): `cd functions && npm run regions`, sonra testler ve deploy.
