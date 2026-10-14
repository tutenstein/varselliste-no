# Varsellisten (varselliste-no)

Norveç'teki kamuya açık olay ve uyarı verilerini (Politiloggen, Statens vegvesen, MET, NVE, Nødvarsel,
NRK) toplayıp kendi veritabanımızda (Firestore) biriktiren ve Norveççe
(bokmål) / İngilizce bir web sitesinde gösteren servis. İsveç'teki `varningslista-se` projesinin
Norveç sürümü; ayrı Firebase projesi, ayrı repo, ayrı veritabanı.

- Site (geçici adres): https://varselliste-no.web.app (bokmål `/`, İngilizce `/en/`)
- Veri kaynakları, kararlar ve gerekçeler: [docs/veri-kaynaklari.md](docs/veri-kaynaklari.md)
- Kurulum ve senin yapman gerekenler: [docs/KURULUM.md](docs/KURULUM.md)

## Yapı

```
functions/              Cloud Functions (TypeScript, Node 22, europe-west1; Firestore europe-north1)
  src/sources/          Kaynak başına çekme + normalleştirme (politiloggen, vegvesen, metalerts, nve, nodvarsel, news)
  src/jobs.ts           Canlı çekme, geri doldurma (BACKFILL_VERSION), bitenleri kapatma
  src/feeds.ts          Sitenin okuduğu hazır akışlar (feeds/live, week, month[-2…]) – FEED_VERSION
  src/index.ts          Zamanlanmış fonksiyonlar
  src/data/             Fylke/kommune kodları (Kartverket) ve kommune merkezleri (Wikidata) – üretilmiş
  scripts/build-regions.mjs  src/data/*'yı yeniden üretir (kommune değişikliklerinde, ör. 1.1.2028)
  src/cli/dryRun.ts     Veritabanına yazmadan canlı veriyi çekip dağılımı gösterir
web/                    Astro statik site + Preact "island" (canlı akış), MapLibre harita (OpenFreeMap)
  src/views/            Sayfa gövdeleri (nb ve en aynı görünümü kullanır)
  src/components/       LiveFeed (filtre, arama, yakınımda, liste, uyarı bantları, haberler), EventMap, StatsCard
  src/i18n.ts           Rotalar, nb/en metinler, polis kategorileri ve DATEX kodları için etiketler
  scripts/fetch-stats.mjs  SSB istatistikleri (derleme sırasında; hata olursa repodaki dosya kullanılır)
firestore.rules         İstemciler yalnızca feeds/* (get) ve sources/* belgelerini okuyabilir
.github/workflows/      deploy (push), nightly (gece yeniden derleme), health (3 saatte bir kontrol)
```

## Yük dağılımı: Firebase ↔ GitHub Actions

| İş | Nerede | Neden |
|---|---|---|
| Canlı veri toplama (2–30 dk) | Cloud Functions | Dakika hassasiyetinde, güvenilir zamanlama gerekiyor. GitHub cron'u en sık 5 dakikada bir çalışır, sık gecikir ve private repoda 2.000 dk/ay kotayı hızla bitirir. |
| Akışların hazırlanması (2 dk) | Cloud Functions (`publishFeeds`) | Yalnızca değişen olayları okur; ziyaretçi başına tek belge okuması, olay deposuna sorgu yok. Maliyet ziyaretçi sayısıyla değil, değişen olay sayısıyla ölçeklenir. |
| Sitenin derlenmesi | GitHub Actions | Her push'ta ve her gece |
| SSB istatistiklerinin çekilmesi | GitHub Actions | Derleme sırasında; Firebase'e dokunmaz |
| Sağlık kontrolü | GitHub Actions (3 saatte bir) | Akış ya da bir kaynak durursa iş başarısız olur ve GitHub e-posta gönderir |
| Sitenin sunulması | Firebase Hosting (CDN) | Statik dosyalar; HTML 5 dk, varlıklar 1 yıl önbellekte |

## Veri akışı

| Fonksiyon | Sıklık | Ne yapar |
|---|---|---|
| `ingestPolitiloggen` | 3 dk | En son mesajı olan 200 konu (gerekirse birkaç sayfa). Geri doldurma sırasında her çalışmada 1 geçmiş gün (30 gün). Tamamen kaldırılan konular sitede de kaldırılır (NLOD §3). |
| `ingestVegvesen` | 2 dk | WFS'den yalnızca son güncellenen kayıtlar (`LAST_UPDATE_TIME`); 30 dakikada bir kimlik görüntüsüyle biten kayıtlar kapatılır. |
| `ingestNodvarsel` | 2 dk | Aktif acil uyarılar; geçmiş liste saatte bir ve bir uyarı bittiğinde. |
| `ingestMetAlerts` | 10 dk | Kara uyarıları (nb + en), `If-Modified-Since` ile; ilk çalışmada son 30 gün. |
| `ingestNews` | 15 dk | 12 NRK bölge akışı; yalnızca olayla ilgili başlıklar (başlık + bağlantı). |
| `ingestNve` | 30 dk | Sel ve heyelan uyarıları (nb + en). |
| `publishFeeds` | 2 dk | Değişen olayları `feeds/live` (48 sa + aktif uyarılar), `feeds/week`, `feeds/month` belgelerine işler; 1 MiB'a yaklaşan akış `month-2…` diye bölünür. |
| `closeExpired` | 30 dk | Bitiş zamanı geçmiş olayları kapatır. |

**Listede gösterilenler:** Politiloggen'in bütün kategorileri (suç dahil, politiet.no'daki gibi; trafik denetimleri
"Kriminalitet" altında), Vegvesen'in gerçek olayları (kaza, durmuş araç, yolda hayvan/cisim, heyelan, sel,
yol hasarı, iptal edilen feribot), MET/NVE uyarıları ve Nødvarsel. **Gösterilmeyenler:** yol çalışmaları, trafik
ışıkları, hız sınırları, planlı kapanmalar. Bunlar veritabanında yine de saklanır. NRK başlıkları ayrı
bir "Nyheter" bloğunda, olay listesine karışmadan gösterilir.

## Site

| Sayfa | Bokmål | İngilizce |
|---|---|---|
| Ana sayfa | `/` | `/en/` |
| Fylke (15) | `/fylke/<slug>/` | `/en/county/<slug>/` |
| Kommune (357) | `/kommune/<slug>/` | `/en/municipality/<slug>/` |
| Dizin A–Å | `/kommuner/` | `/en/municipalities/` |
| Hakkında + kaynak durumu | `/om/` | `/en/about/` |

- Toplam 751 statik sayfa; sayfa başına ≤ 24 KB HTML, harita hariç ~27 KB gzip JavaScript.
- Canlı veri: `<head>` içindeki satır içi fetch, island yüklenmeden `feeds/live` belgesini çekmeye başlar
  (sayfa başına tek Firestore REST okuması; 7 g / 30 g seçilince `week` / `month` eklenir).
- Harita yalnızca açılınca yüklenir; MapLibre CSS'i `?url` ile bağlanır, worker `setWorkerUrl` ile verilir.
- Hosting başlıkları: HTML 5 dk, `/_astro/**` 1 yıl immutable; CSP, nosniff, Referrer-Policy, Permissions-Policy.

## Yerelde

```bash
cd functions && npm install && npm test
npm run dry-run                      # canlı veriyi çeker, yalnızca dağılımı yazar
npm run dry-run -- politiloggen nve  # yalnızca bazı kaynaklar
npm run regions                      # kommune verisini yeniden üretir

cd ../web && npm install && npm test && npm run check
npm run build:fresh                  # SSB istatistiklerini çeker + derler
npm run dev                          # http://localhost:4321 (canlı akışı okur)
```
