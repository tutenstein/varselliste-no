# Veri Kaynakları – Norveç (çalışma adı: Varselliste)

> Araştırma tarihi: 2026-10-14. Bu belgede kod yok; yalnızca bulgular ve öneriler var.
> Şablon: kendi İsveç sitemiz (`varningslista-se`). hälytyslista.fi **yalnızca işlevsel referans**; tasarımı, metinleri, ikonları ve renkleri kopyalanmayacak.
> Yalnızca resmi API, açık veri, RSS ve lisans/sözleşme yolları değerlendirildi. Bot korumasını aşan scraping değerlendirme dışı.
> Uç noktalar 2026-10-14'te az sayıda çağrıyla (döngü yok, tanımlayıcı User-Agent ile) denendi. Hiçbir anahtar veya parola kullanılmadı.
> **Düzeltme (2026-10-14):** İlk taramada Politiloggen için "açık API yok" yazılmıştı; doğru adres `api.politiloggen.politiet.no` ve API açık (NLOD 2.0). Belge buna göre güncellendi.

Durum işaretleri: ✅ = bu araştırmada uç nokta canlı doğrulandı · 📄 = resmi dokümandan · ⚠️ = belirsiz / doğrulanamadı

---

## 1. İsveç sitesinin özellikleri (şablon)

Kaynak: `varningslista-se/web/src` ve `functions/src`.

| # | Özellik | İsveç'te nasıl yapılıyor |
|---|---|---|
| 1 | **24 sa / 7 g / 30 g görünümleri** | `feeds/live` (48 sa + aktif uyarılar), `feeds/week` (2–7 g), `feeds/month` (7–30 g). 7 g / 30 g seçilince eski parçalar ayrıca okunur. |
| 2 | **Kategori kartları** | Trafik kazası, yangın, kurtarma, trafik aksaklığı, uyarı. Kartta sayı var, tıklayınca filtre olur. |
| 3 | **Arama** | Tür, yer, açıklama ve yol üzerinde arar. Yol numarası tam token eşleşmesiyle aranır ("E4", E45'i bulmaz). |
| 4 | **İl (län) filtresi** | Açılır liste; yalnızca ana sayfada var. Seçim URL'de (`?lan=`) saklanır. |
| 5 | **"Yakınımda"** | 5 / 10 / 25 / 50 / 100 km. Konum tarayıcıda kalır ve ~100 m'ye yuvarlanır. İl merkezi (`lan`) ve konumsuz (`saknas`) olaylar hariç tutulur. |
| 6 | **Hava uyarısı şeridi** | Aktif SMHI uyarıları seviyeye göre sıralanır. İlk 3 görünür, gerisi "tümünü göster" ile açılır. |
| 7 | **Harita** | MapLibre 6 + OpenFreeMap. Yalnızca açılınca yüklenir; masaüstünde varsayılan olarak açık. Yaklaşık konumlar halka olarak çizilir. Haritadaki noktaya tıklayınca listedeki olaya gidilir. |
| 8 | **İl ve belediye sayfaları** | Kapsamı sabitlenmiş canlı akış, breadcrumb, aynı ildeki diğer belediyeler, istatistik kartı. |
| 9 | **A–Ö dizini** | `/kommuner/` – 290 belediye. |
| 10 | **Yıllık istatistik kartı** | Derleme sırasında MCF + SCB'den çekilir: tüm müdahaleler, 1000 kişi başına oran, bina yangınları, trafik kazaları, nüfus ve 5 yıllık çubuk grafik. |
| 11 | **Kaynak durumu** | `sources/*` → `feeds/live.sources`. "Hakkında" sayfasında kaynak başına "son başarılı çekim" ve çalışıyor / gecikmeli / hata durumu gösterilir. |
| 12 | **İki dil** | `sv` kökte, `en` `/en/` altında; hreflang ve dil değiştirici var. Kaynak İngilizce metin yayımlıyorsa (SMHI) o metin gösterilir. |
| + | Diğer | Yan panelde "en sık türler" ve "en aktif bölgeler"; filtreler URL'de; 112 düğmesi; "Canlı · Güncellendi hh:mm"; 50'şerlik "daha fazla göster"; günlere göre gruplama; olay satırında yol, şiddet ve durum etiketleri; ≈ yaklaşık konum işareti; kaynak bağlantısı; 60 sn'de bir ve sekme yeniden görünür olunca yenileme; sitemap; 404. |

**Mimari (aynen taşınacak):** Kaynak başına zamanlanmış Cloud Function → `events` + `raw_events` (içerik hash'i ile değişmeyen yazımlar atlanır) → `publishFeeds` yalnızca değişenleri okuyup `feeds/live|week|month` belgelerini yazar → statik Astro sitesi sayfa başına tek bir Firestore REST GET yapar. Ziyaretçiler `events` koleksiyonunu hiç sorgulamaz.

---

## 2. hälytyslista.fi (güncel durum, işlevsel)

`/info` sayfası 2026-10-14'te bir kez okundu (✅). Sitenin kaynakları:

- Kurtarma müdürlüklerinin olay bültenleri (Otiedote, Pohjanmaa akışı)
- Digitraffic Road API
- Otomatik sınıflandırılan haber akışı: 99 görev sınıfı, tahmini konum ve "~" ile işaretlenen tahmini zaman

Yoklama sıklığı bültenler ve trafikte ~2 dk, haberlerde ~30 dk. Geçmiş en fazla 30 gün. Site resmi bir hizmet değildir ve kişi bilgisi göstermez; "yakınımda" konumu ~100 m'ye yuvarlanır ve saklanmaz.

---

## 3. Norveç kaynak tablosu

### 3a. Gerçek zamanlıya yakın olay ve uyarı kaynakları

| Kaynak | Veri | Erişim yolu | Lisans / şartlar | Güncelleme / gecikme | Konum | Kişisel veri / GDPR | Maliyet / kayıt | Durum |
|---|---|---|---|---|---|---|---|---|
| **Statens vegvesen – trafik mesajları, OGC WFS (DATEX 3.1 aynası)**<br>`https://ogckart-sn1.atlas.vegvesen.no/datex_3_1/wfs` | DATEX 3.1 `Situation` verisinin GeoJSON hali. Katmanlar: `SituationSimple_v2` (düz alanlar) ve `Situation` (tam DATEX JSON). Türler: Accident, VehicleObstruction, RoadOrCarriagewayOrLaneManagement (roadClosed …), MaintenanceWorks, EnvironmentalObstruction (flooding, rockfalls, landslips, fallenTrees), AnimalPresenceObstruction, TransitInformation (feribot) vb. | `GetFeature&typeNames=datex_3_1:SituationSimple_v2&outputFormat=application/json`. **`CQL_FILTER=LAST_UPDATE_TIME>'…'` çalışıyor (✅)**, yani delta çekilebilir. Ayrıca `propertyName` ve `count` destekleniyor. | **NLOD**. GetCapabilities yanıtında `Fees=NONE`, `AccessConstraints=NONE`. DATEX şartları (aşağıda) muhtemelen burada da geçerli; kaynak "Statens vegvesen" olarak gösterilmeli. | Yaklaşık gerçek zamanlı: en yeni `LAST_UPDATE_TIME` çekimden ~1,5 dk önceydi. `Last-Modified` yok, bu yüzden koşullu GET yapılamıyor. | **WGS84 nokta veya çizgi** (⚠️ WFS 2.0'da eksen sırası **[enlem, boylam]**). Yol numarası (`E39`, `R…`, `F…`, `K…`). İlçe ve kommune yalnızca serbest metinde ("… i Bjørnafjorden, Vestland"). Tam katmanda fylke numarası (`namedArea.subdivisionCode`) var. | Kişisel veri görülmedi. | Ücretsiz, **kayıt yok** | ✅ (tam görüntü: 2.765 kayıt / 1.248 durum / ~2 MB; son 30 dk delta: 37 kayıt / 1,8 KB) |
| **Statens vegvesen – DATEX II 3.1 düğümü**<br>`https://datex-server-get-v3-1.atlas.vegvesen.no/datexapi/GetSituation/pullsnapshotdata` | WFS ile aynı veri, DATEX XML/JSON olarak | Pull snapshot, HTTP Basic (kullanıcı adı ve parola) + `If-Modified-Since`. Delta (pullDelta) belgelenmemiş. | **NLOD**. Kayıt formundaki şartlar: bilgi çarpıtılmayacak; **"Norveççe mesajlar başka dillere çevrilmeyecek"** (bunun yerine DATEX kodlarından kendi metnimiz üretilmeli); kimlik bilgileri son kullanıcıya verilmeyecek; kaynak her zaman NPRA / Statens vegvesen olarak gösterilecek. | "Sürekli" | WFS ile aynı | Yok | Ücretsiz. **Kayıt formu sabit IP veya DNS adı istiyor**: Cloud Functions'ın sabit IP'si yok, bu yüzden Cloud NAT + statik IP gerekir ve bu ek maliyettir. | ✅ uç nokta var (kimlik bilgisi olmadan 401 döndü). Şartlar 📄. Eski DATEX 2.3 ve "Vegmeldinger" akışı 1 Aralık 2023'te kapandı (📄/⚠️). |
| **MET Norway – MetAlerts 2.0**<br>`https://api.met.no/weatherapi/metalerts/2.0/current.json` | Resmi hava uyarıları (farevarsler): rüzgâr, yağmur, kar, buzlanma, fırtına kabarması, orman yangını tehlikesi, polar alçak basınç, yıldırım vb. Sarı / turuncu / kırmızı. | `current.json` (aktif), `all.json` (**son 30 gün**, aktif + bitmiş), `archive?period=YYYY-MM` (2019–, yılda bir güncellenir). Parametreler: `lang=no\|en`, `county=NN`, `lat/lon`, `event`, `geographicDomain=land\|marine`. RSS ve CAP de var. | **CC BY 4.0 / NLOD 2.0**; "MET Norway" / "Meteorologisk institutt" kaynak olarak gösterilmeli. **Kullanım şartları:** iletişim e-postası veya web sitesi içeren tanımlayıcı **User-Agent zorunlu** (yoksa uyarısız engel); `Expires` dolmadan tekrar sorulmamalı; `If-Modified-Since` kullanılmalı; MetAlerts için **en fazla 10 dakikada bir yoklama**; uygulama başına >20 istek/sn için anlaşma gerekiyor; üründe "Yr" adı kullanılamaz. | Olay odaklı. `Expires` 1–3 dk sonrasını gösteriyor, ama şartlar gereği 10 dk'da bir çekilecek. | Poligon geometri. **`county` ve `municipality` dizileri** (2024 numaralandırması gibi görünüyor ⚠️). Deniz uyarılarında `county` boş. | Yok | Ücretsiz, kayıt yok | ✅ 49 uyarı: **48'i deniz (gale)**, 1'i kara (turuncu yağmur). `lang=en` ile başlık, açıklama, talimat ve sonuç metinleri tamamen İngilizce geliyor. |
| **NVE / Varsom – sel uyarısı (flomvarsling)**<br>`https://api01.nve.no/hydrology/forecast/flood/v1.0.10/api/Warning/{lang}/{start}/{end}` | Sel uyarıları (seviye 1–4) | REST GET, JSON. İlçe (`Warning/County/{nr}`), kommune ve CAP RSS uç noktaları var. `lang` 1 = Norveççe, 2 = İngilizce. | **NLOD**. Kaynak metni: "Varsler fra Flomvarslingen i Norge og www.varsom.no". Eski API sürümleri en az 6 ay yaşıyor; sürüm sabitlenmeli. | Günlük yayın, olay sırasında daha sık. Koşullu GET yok. | `CountyList` ve `MunicipalityList` (**2024 numaraları**; `…Before2024` alanları da var) | ⚠️ `MicroBlogPostList` alanında uyarıyı yazanların adı olabilir; saklanmamalı. | Ücretsiz, anahtar yok | ✅ (Vestland: 86 kayıt, hepsi yer tutucu "yeşil seviye", Id `"xxx"`; bunlar filtrelenmeli) |
| **NVE / Varsom – heyelan uyarısı (jordskredvarsling)**<br>`…/forecast/landslide/v1.0.10/api/Warning/{lang}/{start}/{end}` | Heyelan ve çamur akışı uyarıları | Sel API'siyle aynı yapı | NLOD; "Varsler fra Jordskredvarslingen i Norge og www.varsom.no" | Günlük | İlçe + kommune listesi | Sel ile aynı | Ücretsiz | ✅ 1 aktif uyarı (seviye 2; Vestland, Rogaland, Innlandet; İngilizce metin var). ⚠️ `ValidFrom` ve `ValidTo` alanlarında saat dilimi yok (Norveç yerel saati). |
| **NVE / Varsom – çığ uyarısı (snøskredvarsel)**<br>`…/forecast/avalanche/v6.3.2/api/RegionSummary/Simple/{lang}/{start}/{end}` | Çığ tehlike seviyeleri | REST, Swagger mevcut | NLOD; "Varsler fra Snøskredvarslingen i Norge og www.varsom.no" | Günlük; sezonluk (kış) | **Çığ bölgeleri** (3001+, Svalbard dahil); kommune değil | Yok | Ücretsiz | ✅ 46 bölge, hepsi "No Rating" (mevsim dışı) |
| **DSB – Nødvarsel (cep telefonu acil uyarısı)**<br>`https://www.nodvarsel.no/rss/rss-aktive-nodvarsler/`<br>`https://www.nodvarsel.no/rss/rss-tidligere-nodvarsler/` | Halka yönelik acil uyarılar (cell broadcast). Örnekler: "Brann, Sortland", "EKSPLOSJONSFARE", "AKUTT FARE OVER" | RSS 2.0: `title`, `link`, `guid`, `a10:updated`. Açıklama başlıkla aynı. Alan bilgisi RSS'te yok; yalnızca HTML detay sayfasında (`data-circles="[[enlem,boylam,yarıçap_km]]"`). | **RSS şartları:** ücretsiz; verinin nodvarsel.no'dan geldiği açıkça belirtilmeli; kendi içeriğimizden açıkça ayrılmalı; nodvarsel.no'ya görünür, tıklanabilir bağlantı verilmeli. | Anında; RSS istek anında üretiliyor. Yılda ~25 uyarı. | Yalnızca başlıktaki yer adı (ör. "Sortland" → kommune). Daire ancak HTML'den alınabilir (⚠️ önce DSB'ye sorulmalı). | Yok | Ücretsiz | ✅ (aktif akış şu an boş; geçmiş akışta 25 kayıt). Akışta "TEST" ve "Nasjonal varslingsprøve" kayıtları var, filtrelenmeli. Açık bir CAP veya API yok (CAP yalnızca operatörlere gidiyor). |
| **Politiet – Politiloggen API**<br>`https://api.politiloggen.politiet.no`<br>(Swagger: `/index.html`, spec: `/swagger/v1/swagger.json`) | Polis operasyon merkezlerinin mesajları; konu (thread) + güncellemeler. Kategoriler: Arrangement, **Brann**, Dyr, Innbrudd, **Redning**, Ro og orden, **Savnet**, **Sjø**, Skadeverk, **Trafikk**, Tyveri, **Ulykke**, Voldshendelse, **Vær**, Andre hendelser. **İsveç'teki Polisen'in karşılığı.** | REST JSON, **kimlik doğrulama yok**. Uç noktalar:<br>• `/messagethreads`: tarih aralığı, `TimeSpanType`, polis bölgesi, kommune, kategori ve aktif/pasif filtresi; `Take`/`Skip`; `LastMessageOn` sıralaması<br>• `/messages`, `/messages/{id}`<br>• `/feeds/rss`, `/feeds/atom`<br>• `/messages/export`: tüm mesajlar, günde bir kez üretilen CSV; geri doldurma için uygun<br>• `/categories`, `/districts`, `/districts/extended` | **NLOD 2.0** (spec'te yazıyor); kaynak gösterilmeli. Spec notu: "API sürekli geliştiriliyor, **format haber verilmeden değişebilir**." Geri bildirim: `politiloggen@politiet.no`. Hız sınırı belgelenmemiş (`Cache-Control: max-age=10`); çekim 2–5 dk'da bir tutulmalı. POD yönergesi 2023/017'ye göre basın alanı (NTB) ayrı ve bize gerekmiyor. | **Gerçek zamanlı.** Örnek: Kaupanger yangını 07:59 UTC'de açıldı, 08:13'te güncellendi. Son 24 saatte ≥ 50 konu var (`hasMoreResults=true`). | `municipality`: kommune **adı** (numara değil); `area`: yer veya mahalle adı; `district`: 12 polis bölgesi (fylke ile aynı değil). Koordinat yok → kommune merkezi kullanılacak, `geoPrecision: kommune`. | politiet.no'nun **kendisi** başlığı `Kategori: Kommune, Område` biçiminde gösteriyor; `area` URL'de bile var. Suç kategorileri de sayfada varsayılan "Alle" filtresiyle listeleniyor (✅ sayfa kodundan doğrulandı). Biz de **polisin gösterdiği düzeyi aşmadan** gösterebiliriz. Mesaj tipleri arasında `Removed` ve `Edited` var: kaynakta silinen veya düzeltilen mesaj bizde de silinmeli veya güncellenmeli (NLOD §3). | Ücretsiz, kayıt yok | ✅ Son 50 konu: Trafikk 30, Andre hendelser 6, Brann 5, Ro og orden 3, Innbrudd / Savnet / Redning / Tyveri / Ulykke / Dyr 1'er; 13'ü aktif; 50'sinin hepsinde kommune var. |
| *(not)* politiet.no web sayfası ve eski `api.politiet.no` | – | `www.politiet.no/politiloggen` bir Next.js uygulaması; HTML'de veri yok, veri yukarıdaki API'den geliyor. `politiet.no/robots.txt` → `Disallow: /api/`. Ön taramadaki `api.politiet.no` yanlış adresti (TCP bağlantısını reddediyor). | – | – | – | – | – | **Scraping gerekmiyor ve yapılmayacak**; resmi API kullanılacak. |
| **110-sentraler / brannvesen** | Canlı müdahale listesi | Hiçbir 110 merkezinde veya büyük itfaiyede RSS, API ya da liste bulunamadı (Oslo BRE, Bergen, TBRT, Rogaland/Sør-Vest 110, Vest 110, Øst 110, Sør-Øst 110). İletişim sosyal medya (X/Facebook) üzerinden yapılıyor. | Sosyal medya, API anlaşması olmadan kaynak olarak kabul edilemez. | – | – | – | **Her 110 IKS ile ayrı izin/sözleşme gerekir** | ⚠️ yok (İsveç'teki gibi ulusal akış yok) |
| **Hovedredningssentralen (JRCC)**<br>`https://www.hovedredningssentralen.no/feed/` | Kurtarma operasyonu bültenleri ("Redningsaksjon ved Narvik Havn") | WordPress RSS (10 kayıt) | Yeniden kullanım şartı bulunamadı → **yalnızca başlık + bağlantı** | Seyrek (ayda birkaç) | Başlıktaki yer adı | Düşük | Ücretsiz | ✅ yerelden · ⚠️ 2026-10-14: Cloud Functions'tan (europe-west1) "fetch failed" – bulut IP'leri engelleniyor olabilir; izin gerekir |
| **NRK – bölge "siste" RSS'leri**<br>`https://www.nrk.no/<bölge>/siste.rss` | Bölge haber merkezlerinin kısa haberleri. Örnekler: "Brann i stolpetrafo i Kaupanger", "Fjellovergang stengd på grunn av bilberging". Finlandiya'daki "haberden olay" modelinin karşılığı. | RSS. Bölgeler: buskerud, innlandet, mr, nordland, ostfold, rogaland, sorlandet, stor-oslo, tromsogfinnmark, trondelag, vestland, vestfold (+ ulusal `toppsaker.rss`, `nyheter/siste.rss`). ⚠️ Bölge → fylke eşlemesi Faz 3'te doğrulanmalı (Telemark?). | **nrk.no/rss şartları:** bağlantı doğrudan nrk.no'ya gitmeli (çerçeve veya JS yok); içerik "NRK Nyheter" / "Nyheter fra NRK" olarak etiketlenmeli; içerikten ayrılmalı; **başlık ve metin değiştirilemez**; makale, makale parçası veya görsel kopyalanıp saklanamaz; şartlar haber verilmeden değişebilir. | Dakikalar (`max-age=60`); 20 kayıt ≈ 18 saat | Konum yok; yalnızca bölge. Kommune, başlıktaki yer adından çıkarılmalı. | `toppsaker` akışında `dc:creator` (gazeteci adı) var; saklanmamalı. Haberlerde kişi adı geçebilir. | Ücretsiz | ✅ (Vestland'de 20 kaydın 18'i kısa yerel haberdi) |
| **Entur – SIRI-SX** (toplu taşıma aksaklıkları)<br>`https://api.entur.io/realtime/v1/rest/sx` | Tren, otobüs ve feribot aksaklıkları ve iptaller (Vy, Bane NOR …) | REST (XML). `ET-Client-Name` başlığı zorunlu (anahtar değil, tanımlayıcı). `requestorId` ile yalnızca değişiklikler alınabiliyor. | **NLOD**; "Data made available by Entur" | Gerçek zamanlı. REST Lite sınırı 4 istek/dk. | Koordinat yok; NSR durak kimlikleri üzerinden eşlenebilir. | Yok | Ücretsiz | ✅ (50 kayıt, çoğu Vy/NSB) |
| **Kystverket / BarentsWatch** (seyir uyarıları) | NAVAREA XIX, kıyı uyarıları | BarentsWatch API (OAuth, ücretsiz kayıt) ⚠️ | – | – | – | – | Kayıt | ⚠️ doğrulanmadı |
| **Avinor** | Uçuş durumu ve iptaller | `asrv.avinor.no/XmlFeed/v1.0` | NLOD 📄 | – | Havalimanı | – | Ücretsiz | 📄 (olay verisi değil; kapsam dışı) |
| **Luftambulansetjenesten** | Hava ambulansı görevleri | Açık akış yok | Sağlık verisi | – | – | Hassas | – | ⚠️ kapsam dışı |

### 3b. İstatistik kaynakları (derleme sırasında)

| Kaynak | Veri | Erişim | Lisans | Güncelleme | Konum | Durum |
|---|---|---|---|---|---|---|
| **SSB 12058 – Brann- og ulykkesvern (KOSTRA)**<br>`https://data.ssb.no/api/pxwebapi/v2/tables/12058/data?…` | 34 ölçü: **müdahale sayısı** (`KOSutrykningerto0000`), **bina yangını** (`KOSbygningsbrann0000`), **konut yangını** (`KOSboligbranner0000`), 1000 kişi başına müdahale … | PxWebApi **v2** (GET, json-stat2) | **CC BY 4.0**, "Kilde: Statistisk sentralbyrå" | Yıllık; 2015–2025 (2025 verisi 2026-06-15'te yayımlandı) | 357 kommune (+ "Landet") | ✅ 2025, Norveç geneli: 91.242 müdahale, 3.160 bina yangını, 1.916 konut yangını. ⚠️ Müdahaleler olay yerine göre değil, **müdahale eden kommune** altında sayılıyor; bazı kommunelerde eksik yıl önceki yıl verisiyle dolduruluyor. Trafik kazası ve kurtarma kırılımı yok. |
| **SSB 11342 – Areal og befolkning** | Kommune nüfusu (1 Ocak) | v2, `codelist[Region]=agg_KommGjeldende` | CC BY 4.0 | Yıllık (1.1.2026 mevcut) | 357 kommune | ✅ toplam 5.627.400 |
| **SSB 09006 / 10209 – trafik kazalarında ölü ve yaralı** | Trafik kazası kayıpları | v2 | CC BY 4.0 | Yıllık / aylık | **Yalnızca politidistrikt** (kommune yok) | ✅ Kommune kartı için uygun değil |
| **DSB – BRIS / brannstatistikk.no** | 2017'den beri tüm 110 müdahaleleri, tür bazında | Yalnızca JS tek sayfalık uygulaması; arka uç API'si belgelenmemiş ve bir kısmı oturum gerektiriyor; açık lisans yok | – | Sürekli | Kommune | ⚠️ **Açık API yok; DSB ile iletişim/izin gerekir.** Dahili API kullanılmayacak. |
| **NVDB – trafik kazası nesnesi (570)** | Polis kayıtlı yaralanmalı kazalar | NVDB API Les v4 | NLOD | – | Koordinat ve kommune | ⚠️ erişim ve kişisel veri kısıtı doğrulanmadı (v0.2) |

### 3c. Referans verileri

| Kaynak | Kullanım | Lisans | Durum |
|---|---|---|---|
| **Kartverket kommuneinfo** `https://api.kartverket.no/kommuneinfo/v1` (`/fylker`, `/kommuner`, `/fylkerkommuner`, `/punkt`) | Fylke ve kommune kodları ve adları. `punktIOmrade` (kommunenin içinde olduğu garanti edilen nokta) ve sınır kutusu; koordinattan kommune bulma (`/punkt`). | **CC BY 4.0** | ✅ **15 fylke, 357 kommune**. ⚠️ `kommunenavn` alanı 12 kommunede **Saami adını** döndürüyor (ör. 5612 Guovdageaidnu); görüntüleme ve slug için `kommunenavnNorsk` kullanılmalı. |
| **SSB Klass 131** (kommune değişiklikleri) | Yıllık değişikliklerin takibi | CC BY 4.0 | ✅ 2026'da numara değişikliği yok (yalnızca resmi ad eklemeleri: "Oslo – Oslove", "Steinkjer – Stïentje", "Lyngen – Ivgu – Yykeä"). ⚠️ **1 Ocak 2028:** Vestvågøy (1860) + Moskenes (1874) → 1876 Vest-Lofoten; Gran Innlandet'ten Akershus'a geçiyor (3446 → 3244). Bunlar ikincil kaynaklardan; 2027 sonunda doğrulanmalı. |
| **Wikidata** (P2504 kommune numarası + P625 koordinat) | Kommune merkezi koordinatları (genelde idari merkez) | **CC0** | ✅ Uygun filtreyle (P576 yok, P2504 bildiriminde bitiş yok, rank deprecated değil) **357/357** kommune tek öğeye eşleniyor ve hepsinde koordinat var. Tuzaklar: eski numaralar başka öğelerde de kullanılmış; 0301 hem "Oslo kommune" hem "Oslo"da (deprecated) var; 14 kommunede iki koordinat var; gelecekteki "Vest-Lofoten" (1876) şimdiden listede. Wikidata noktası Kartverket `punktIOmrade` noktasından medyan 6,2 km, en fazla 51 km uzakta. |
| **Kartverket stedsnavn** (SSR) | Yer adı → kommune (NRK ve Nødvarsel başlıkları için, ör. "Kaupanger" → Sogndal) | CC BY 4.0 | 📄 (v0.2) |

**Slug çakışmaları** (küçük harf, æ→ae, ø→o, å→a): 357 kommunede 355 benzersiz slug.
- `heroy`: 1515 Herøy (Møre og Romsdal) ve 1818 Herøy (Nordland)
- `valer`: 3114 Våler (Østfold) ve 3419 Våler (Innlandet)

Öneri: bu ikisi fylke ekiyle ayrılsın (`heroy-more-og-romsdal`, `heroy-nordland`, `valer-ostfold`, `valer-innlandet`) ve çakışmayı bir test yakalasın. "Oslo" hem fylke hem kommune, ama ayrı yollarda (`/fylke/oslo/`, `/kommune/oslo/`) olduğu için sorun yok.

**2024 fylke listesi (✅ Kartverket):** 03 Oslo (1 kommune) · 11 Rogaland (23) · 15 Møre og Romsdal (27) · 18 Nordland (41) · 31 Østfold (12) · 32 Akershus (21) · 33 Buskerud (18) · 34 Innlandet (46) · 39 Vestfold (6) · 40 Telemark (17) · 42 Agder (25) · 46 Vestland (43) · 50 Trøndelag (38) · 55 Troms (21) · 56 Finnmark (18) = **357**

---

## 4. Özellik eşlemesi: İsveç → Norveç

| İsveç özelliği | Norveç'te | Kaynak | Not |
|---|---|---|---|
| Trafik kazaları ve aksaklıklar (canlı) | ✅ **Tam** | Vegvesen WFS (veya DATEX) | Trafikverket'in karşılığı. Koordinat ve yol numarası var. Kommune adı konum metninden ya da koordinattan çıkarılır. |
| Yangın ve kurtarma (canlı) | ✅ **İyi** | **Politiloggen API** (Brann, Redning, Ulykke, Savnet, Sjø, Trafikk) + Nødvarsel; ek olarak NRK | Polisen'in karşılığı, üstelik daha hızlı: konular gerçek zamanlı açılıp güncelleniyor ve aktif/pasif bilgisi var. Yalnızca polisin karıştığı olaylar görünüyor; 110 merkezleri ayrı bir liste yayımlamıyor. |
| Hava uyarısı şeridi | ✅ **İsveç'ten iyi** | MetAlerts + NVE (sel, heyelan) | Kommune listesi ve İngilizce metin var. Deniz uyarıları (48/49) şeridi boğar; varsayılan olarak yalnızca kara uyarıları gösterilmeli. |
| Resmi acil uyarı (VMA karşılığı) | ✅ (İsveç'te yapılamamıştı) | Nødvarsel RSS | Seyrek ama kritik. Sayfanın üstünde ayrı kırmızı bir bant olarak gösterilmeli. |
| 24 sa / 7 g / 30 g | ✅ | Kendi veritabanımız | MetAlerts `all.json` ile 30 günlük uyarı geçmişi ilk çalışmada doldurulabilir. Vegvesen'de geçmiş yok (yalnızca aktif durumlar). |
| Kategori kartları | ✅ | Kendi taksonomimiz | Trafik kazası · Yangın · Kurtarma · Trafik aksaklığı · **Suç / asayiş** (Politiloggen; varsayılan olarak görünür) · Uyarı (+ Acil uyarı bandı) |
| Arama (yol numarasında tam eşleşme) | ✅ | – | Norveç yol biçimleri: `E6`, `Rv7` / `R7`, `Fv1504` / `F1504`. "E6", E69'u bulmamalı; `rv7` ile `r7` aynı sayılmalı. |
| Fylke filtresi | ✅ | Kartverket | 15 fylke |
| "Yakınımda" | ✅ Vegvesen için hassas<br>⚠️ diğerleri kaba | Vegvesen koordinatları; NRK ve Nødvarsel için kommune merkezi | `geoPrecision` korunacak. Fylke düzeyindeki olaylar (NRK bölgesi) "yakınımda"ya hiç girmeyecek. |
| Harita | ✅ | MapLibre + OpenFreeMap | Aynı yaklaşım |
| Fylke ve kommune sayfaları | ✅ | Kartverket | 15 + 357 sayfa (× 2 dil) |
| A–Ø dizini | ✅ | Kartverket | Norveç alfabesi: … X Y Z **Æ Ø Å** (`localeCompare('nb')` ile) |
| Yıllık istatistik kartı | ✅ (kısmen) | SSB 12058 + 11342 | Müdahale, bina yangını, konut yangını, 1000 kişi başına, nüfus. **Kommune bazında trafik kazası istatistiği SSB'de yok** (yalnızca politidistrikt). |
| Kaynak durumu sayfası | ✅ | `sources/*` | – |
| İki dil (nb + en) | ✅ | – | MET ve NVE İngilizce metin veriyor. **Vegvesen'in Norveççe metni çevrilemez** (DATEX şartı): İngilizce arayüzde tür ve durum DATEX kodlarından kendi metnimizle gösterilir, serbest metin olduğu gibi Norveççe kalır ("as published"). NRK başlıkları da değiştirilemez. |

**Yapılamayanlar ve sınırlar (özet)**
1. **Polis olaylarında hassas konum:** yok; yalnızca kommune adı ve `area` (yer adı, politiet.no'daki gibi gösterilecek). Haritada kommune merkezi kullanılacak. API formatı haber verilmeden değişebilir, bu yüzden sağlık kontrolü şart.
2. **İtfaiyenin (110) kendi canlı listesi:** yok (İsveç'teki gibi). Politiloggen yalnızca polisin karıştığı olayları gösteriyor.
3. **BRIS olay detayı:** açık API yok. Yıllık toplamlar SSB'den alınacak.
4. **Vegvesen metninin İngilizceye çevrilmesi:** şartlar gereği yapılmayacak.
5. **NRK metni:** değiştirilemez ve saklanamaz. Yalnızca başlık + bağlantı + kendi kategori etiketimiz.
6. **Kommune bazında trafik kazası istatistiği:** SSB'de yok (NVDB v0.2'de incelenecek).

---

## 5. Hukuki ve GDPR notları (Datatilsynet)

- **Kaynak gösterimi:**
  - Politiet / Politiloggen (NLOD 2.0). Lisans ve kaynağa bağlantı verilmeli. Metin: «Inneholder data under norsk lisens for offentlige data (NLOD) distribuert av Politiet» (en: "Contains data under the Norwegian licence for Open Government data (NLOD) distributed by the Norwegian Police"). Polis adı, logosu veya arması sitemizi tanıtmak için kullanılmayacak (NLOD §6).
  - Statens vegvesen (NLOD)
  - MET Norway (CC BY 4.0 + lisans bağlantısı)
  - NVE / Varsom (hizmet başına ayrı metin)
  - nodvarsel.no (görünür bağlantı, içerikten ayrı)
  - NRK ("Nyheter fra NRK", doğrudan bağlantı)
  - SSB ve Kartverket (CC BY 4.0)
- **Kişisel veri:**
  - Sokak adresi gösterilmeyecek.
  - Konum kommune düzeyine indirilecek. Vegvesen'in yol koordinatı kişisel veri değil ama listede yine kommune + yol gösterilecek.
  - NRK `dc:creator`, NVE `MicroBlogPostList` ve yazar alanları saklanmayacak.
  - Suç haberleri (NRK'da "politiet etterforsker …" vb.) **varsayılan olarak gösterilmeyecek**; sınıflandırıcı bunları dışarıda bırakacak.
  - Saklama: 30 günden eski serbest metin silinip yalnızca toplu sayılar tutulabilir. Kullanıcı konumu yalnızca tarayıcıda kalacak.
  - **Politiloggen:**
    - Kaynakta silinen (`Removed`) veya düzeltilen (`Edited`) mesajlar bizde de silinmeli veya güncellenmeli. Son 30 günün konuları düzenli olarak yeniden okunup karşılaştırılacak.
    - `area` politiet.no'daki gibi gösterilebilir (`Kommune, Område`). Bundan daha hassas konum üretilmeyecek: haritada nokta kommune merkezinde kalacak; `area` → koordinat dönüşümü v0.2'de, yalnızca yer adı düzeyinde yapılacak.
    - **Karar (2026-10-14): suç kategorileri (Innbrudd, Tyveri, Voldshendelse, Ro og orden, Skadeverk) varsayılan olarak gösterilecek**, politiet.no'daki gibi. Yeniden yayımladığımızda ayrı bir veri sorumlusu olduğumuz için (GDPR m.10, personopplysningsloven) şu önlemler alınacak:
      - **Olay başına ayrı sayfa yok.** Liste tarayıcıda Firestore'dan yükleniyor, bu yüzden tek tek kayıtlar arama motorlarında dizinlenmez.
      - **"Om" / "About" sayfasında kaldırma talepleri için bir iletişim adresi.**
      - Ek iş yok, ama normal yoklamada gelen `Removed`/`Edited` işaretleri uygulanacak (NLOD §3).
    - Görseller (`imageUrl`) kopyalanmayacak.
- **Bağımsızlık beyanı:** site resmi değildir; acil durumda **110 (yangın), 112 (polis), 113 (ambulans)** aranmalıdır. Norveç'te 112 polisin numarası; üç numara birlikte gösterilmeli. Kurum logoları kullanılmayacak.
- **User-Agent:** MET şartları gereği gerçek bir iletişim e-postası veya site adresi **canlıya çıkmadan önce zorunlu**. Şimdilik yer tutucu kullanılacak; ⏳ hatırlatılacak.
- **Gizlilik politikası:** bokmål + İngilizce sayfa ve meşru menfaat değerlendirmesi (berettiget interesse).

---

## 6. Alan adı (.no) ve alternatifler

**Norid kuralları (📄 norid.no, son değişiklik 2025-08-12):**

**Kuruluşlar:**
- Enhetsregisteret'te kayıtlı (organizasyon numaralı) ve fiilen faal olmalı.
- **Norveç posta adresi şart.**
- .no altında en fazla 100 ad alınabilir.
- Uygun türler arasında ENK (şahıs şirketi) ve **NUF** (Norveç'te kayıtlı yabancı şirket) da var. Yani yabancı bir şirket NUF olarak kaydolup Norveç adresiyle .no alabilir (⚠️ maliyeti ve adres şartı ayrıca doğrulanmalı).

**Kişiler:**
- 18 yaşından büyük olmalı.
- Folkeregisteret'te Norveç kimlik numarası (fødselsnummer) bulunmalı; D-numarası belgelerde geçmiyor ⚠️.
- Norveç posta adresi şart.
- En fazla 5 ad alınabilir.

Kayıt yalnızca bir kayıt kuruluşu (registrar) üzerinden yapılıyor.

**Alternatifler:**
1. Geçici: `https://<proje-id>.web.app` (ücretsiz, hemen kullanılabilir)
2. `.com` / `.net`: ikamet şartı yok
3. `.eu`: AB/AEA'da ikamet eden kişi veya kuruluşlar (Norveç AEA'da) ⚠️
4. Uzun vade: NUF veya Norveç ortaklı bir kuruluş üzerinden `.no`

**DNS kontrolü (2026-10-14):** `varselliste.no`, `varselliste.com`, `varsellista.no`, `varsellisten.no` ve `hendelsesliste.no` için NS kaydı yok. Muhtemelen boşlar (⚠️ kayıt kuruluşunda doğrulanmalı).

---

## 7. Altyapı bulguları (Faz 2 için)

- **Norveç'te GCP bölgesi yok** (Oslo bölgesi 2022'de duyuruldu ama açılmadı). Yakın bölgeler: europe-north1 (Hamina, Finlandiya) ve europe-north2 (Stockholm).
- **Cloud Scheduler europe-north1 ve europe-north2'de yok** (📄 docs, 2026-10-09). Avrupa'da desteklenenler: europe-central2, europe-west1/2/3/4/6/8/9/12. firebase-tools 15'te v2 `onSchedule` işi fonksiyonun kendi bölgesinde açılıyor. Bu yüzden **fonksiyonlar europe-west1'de, Firestore europe-north1'de** olacak (İsveç'teki son durumla aynı).
- **Firestore:** europe-north1 bölgesel konum olarak destekleniyor 📄.
- **firebase-tools:** en güncel sürüm 15.33.0, yerelde 13.34. Komutlar `npx firebase-tools@15` ile çalıştırılacak. `firestore:databases:create "(default)" --location europe-north1` ve `firestore:databases:get` sözdizimi kaynak koddan doğrulandı.
- **Vegvesen DATEX düğümü** sabit IP istediği için, Cloud Functions'tan kullanmak Cloud NAT + statik IP gerektirir (aylık ek maliyet). **WFS bu sorunu ortadan kaldırıyor.**
- **Yük tahmini:**

| Kaynak | Sıklık | Çağrı / gün | Not |
|---|---|---|---|
| Politiloggen | 2–5 dk | 288–720 | `/messagethreads`, `LastMessageOn` sırasıyla |
| Vegvesen WFS delta | 2 dk | 720 | Çağrı başına birkaç KB |
| Vegvesen tam görüntü | 30 dk | 48 | Yalnızca ID alanları; bitenleri kapatmak için |
| MetAlerts | 10 dk | 144 | `If-Modified-Since` ile |
| NVE (sel + heyelan) | 30 dk | 2 × 48 | |
| Nødvarsel | 2 dk | 720 | Küçük RSS |
| NRK | 10 dk | ~12 akış × 144 | |

---

## 8. Önerilen MVP

**v0.1: sözleşme gerektirmeyen kaynaklar**

0. **Politiloggen API** (yangın, kurtarma, kaza, kayıp, deniz, trafik)
   - 2–5 dk'da bir `/messagethreads` (`LastMessageOn` sırası, değişenler).
   - İlk çalışmada 30 günlük geçmiş `DateTimeFrom/To` ile yavaş yavaş, ya da `/messages/export` CSV'si ile tek seferde doldurulur.
   - Normal yoklamada gelen `Removed`/`Edited` mesajlar bizde de silinir veya güncellenir.
   - Suç kategorileri dahil bütün kategoriler varsayılan olarak gösterilir (karar: 2026-10-14).
   - Kommune: ad + polis bölgesi → kommune numarası. Herøy ve Våler bölgeyle ayrılır.
   - Listeye neyin gireceği (ör. "Trafikk" konularının hangileri kaza) Faz 3'te dry-run dağılımına bakılarak seçilecek.
1. **Statens vegvesen WFS** (`SituationSimple_v2` + kommune çıkarımı için gerekirse `Situation`)
   - 2 dk'da bir `LAST_UPDATE_TIME` deltası.
   - 30 dk'da bir yalnızca ID içeren tam görüntü; listeden düşen durumlar `avsluttet` yapılır.
   - Listeye neyin gireceği gerçek dağılıma bakılarak seçilecek. Bugünkü görüntüde 2.765 kaydın ~%90'ı yol çalışması, şerit yönetimi, hız ve ağ yönetimiydi; kaza yalnızca 4'tü.
   - Kommune bulma: önce konum metnindeki "i <Kommune>, <Fylke>" kalıbı, sonra koordinat.
2. **MET MetAlerts** (nb + en)
   - 10 dk'da bir, `If-Modified-Since` ile.
   - Varsayılan olarak yalnızca kara uyarıları.
   - İlk çalışmada `all.json` ile 30 günlük geçmiş doldurulur.
3. **NVE sel + heyelan uyarıları** (nb + en): 30 dk'da bir; seviye ≥ 2.
4. **Nødvarsel RSS:** 2 dk'da bir.
   - Başlık + bağlantı + zaman; kommune başlıktan çıkarılır.
   - Test kayıtları filtrelenir.
   - Sayfanın üstünde kırmızı bant.
5. **NRK bölge `siste.rss`** (Faz 2 kararıyla MVP'de)
   - Yalnızca **değiştirilmemiş başlık + bağlantı**, ayrıca "Nyheter fra NRK" etiketi.
   - Hovedredningssentralen RSS'i de MVP'deydi; Cloud Functions'tan erişilemediği için (bulut IP'leri engelleniyor) **2026-10-14'te kaldırıldı**.
   - NRK şartı içeriğin bizimkinden ayrılmasını istiyor. Bu yüzden olay listesine karışmayacak; ana sayfada ve fylke/kommune sayfalarında **ayrı bir "Nyheter" bloğu** olacak (öneri; Faz 4'te kesinleşecek).
   - Olaylarla ilgili haberler kendi anahtar kelime sınıflandırıcımızla seçilecek (yangın, kaza, kurtarma, kapanan yol, kayıp …). Kural, Faz 3'te gerçek veriyle yazılacak.
   - NRK `dc:creator` ve görseller saklanmayacak.
   - NRK bölgeleri yayınla (fylke) eşleşiyor; kommune, başlıkta kommune adı geçiyorsa belirlenecek.
6. **İstatistik:** SSB 12058 + 11342 (derleme sırasında; hata durumunda repodaki dosya kullanılır).
7. **Referans:** Kartverket (kodlar, adlar, sınır kutusu) + Wikidata (merkez koordinatı; Kartverket sınır kutusuyla doğrulanır).
8. **Sayfalar:** İsveç'teki bütün özellikler.
   - Ana akış, 15 fylke, 357 kommune, A–Ø dizini, hakkında ve kaynak durumu.
   - nb `/` + en `/en/`.

**v0.2 ve sonrası**

- Kartverket stedsnavn ile köy ve yer adı → kommune (NRK ve Nødvarsel için daha iyi konum)
- Çığ uyarıları (kış sezonu, bölge poligonlarıyla)
- Entur SIRI-SX (tren ve feribot aksaklıkları)
- Nødvarsel alan dairesi (DSB onayıyla)
- NVDB kaza istatistiği
- E-posta veya push bildirimi

**Paralel başlatılması önerilen iletişimler**

| Kurum | Konu | Önem |
|---|---|---|
| **politiloggen@politiet.no** | Zorunlu değil, nezaket gereği: kullanımı bildirmek ve kabul edilebilir yoklama sıklığını sormak (hız sınırı belgelenmemiş) | Orta |
| **Statens vegvesen** (`datex@vegvesen.no`) | WFS'nin bu amaçla ve bu sıklıkta kullanımının onayı; DATEX şartlarının WFS için de geçerli olup olmadığı | Yüksek |
| **DSB** | Nødvarsel için yapılandırılmış veya CAP akışı; BRIS verisine erişim | Orta |
| 110 IKS'ler (Oslo, Vest, Sør-Vest, Trøndelag) | Müdahale listesi | Orta |
| NRK | Başlıktan fazlası gerekirse lisans | Düşük |

**Açık sorular**
- MetAlerts `county` kodlarının 2024 numaralandırması olduğu (Faz 3'te veriyle doğrulanacak).
- Vegvesen `ACTIVE` alanının anlamı (taze bir kaza `0` görünüyordu; bu alana güvenilmeyecek).
- NRK bölge → fylke eşlemesi (Vestfold / Telemark, Stor-Oslo).
- 2028 kommune değişikliklerinin kesinliği.

---

## 9. Faz 2 kararları (2026-10-14)

| Konu | Karar |
|---|---|
| Marka adı | **Varsellisten** |
| Firebase proje ID'si | **`varselliste-no`** → geçici adres `https://varselliste-no.web.app` |
| Bölgeler | Firestore **europe-north1** (`(default)`), Cloud Functions **europe-west1** (Cloud Scheduler europe-north1/north2'de yok; Norveç'te GCP bölgesi yok) |
| GitHub | Private repo; kullanıcı açıp URL'yi verecek |
| İletişim e-postası | Şimdilik yer tutucu. ⏳ Canlıya çıkmadan önce gerçek adres gerekli (MET User-Agent şartı + "Om" sayfasındaki kaldırma talebi adresi). |
| MVP kaynakları | Politiloggen, Statens vegvesen (WFS), MET MetAlerts, NVE (sel + heyelan), Nødvarsel, NRK bölge RSS. (Hovedredningssentralen RSS 2026-10-14'te kaldırıldı: Google Cloud'dan erişim engelli.) İstatistik: SSB 12058 + 11342. Referans: Kartverket + Wikidata. |
| Suç kategorileri | Varsayılan olarak **gösterilecek**. Önlemler: olay başına ayrı sayfa yok; "Om" sayfasında kaldırma talebi adresi. |
| `area` (Politiloggen) | politiet.no'daki gibi gösterilecek (`Kommune, Område`); haritada kommune merkezi. |
| Acil numaralar (110/112/113) | Başlıkta düğme yok; yalnızca altbilgide bilgilendirme metni (karar: 2026-10-14). |

---

## Kaynaklar

- İsveç şablonu: `/Users/salih/Documents/varningslista-se` (README, docs, functions/src, web/src)
- hälytyslista.fi /info (2026-10-14)
- **Statens vegvesen**
  - DATEX: https://www.vegvesen.no/en/fag/technology/open-data/a-selection-of-open-data/what-is-datex/ · kayıt: …/what-is-datex/get-access/
  - WFS: https://www.vegvesen.no/om-oss/om-organisasjonen/apne-data/et-utvalg-apne-data/ogc-karttjenester/kartlag/ · https://dataut.vegvesen.no/en/dataset/trafikkmeldinger
- **MET**
  - https://api.met.no/weatherapi/metalerts/2.0/documentation
  - https://api.met.no/doc/TermsOfService
  - https://api.met.no/doc/License
- **NVE:** https://api.nve.no/doc/ (flomvarsling, jordskredvarsling, snoeskredvarsel)
- **DSB / Nødvarsel**
  - https://www.nodvarsel.no/rss/
  - https://www.dsb.no/rss/
  - https://brannstatistikk.no/
- **Politiet**
  - Politiloggen API: https://api.politiloggen.politiet.no/index.html · spec: https://api.politiloggen.politiet.no/swagger/v1/swagger.json
  - POD yönergesi 2023/017: https://politiet.no/globalassets/dokumenter-strategier-og-horinger/pod/presse-og-nyheter/nasjonal-retningslinje-for-publisering-pa-politiloggen.pdf
- **NLOD 2.0:** https://data.norge.no/nlod/en/2.0 (§3 istisnalar: kişisel veri; §5 kaynak gösterimi; §6 doğru kullanım)
- **HRS:** https://www.hovedredningssentralen.no/feed/
- **NRK:** https://www.nrk.no/rss/
- **Entur:** https://developer.entur.org/pages-real-time-api
- **SSB**
  - https://www.ssb.no/en/api/pxwebapiv2
  - https://www.ssb.no/en/diverse/lisens
  - tablolar 12058, 11342, 09006, 10209
- **Kartverket**
  - https://api.kartverket.no/kommuneinfo/v1/openapi.json
  - Geonorge metadata 041f1e6e-bdbc-4091-b48f-8a5990f3cc5b
- **Wikidata:** https://query.wikidata.org/ (P2504, P625)
- **Google Cloud**
  - https://docs.cloud.google.com/scheduler/docs/locations
  - https://docs.cloud.google.com/firestore/native/docs/locations
  - https://firebase.google.com/docs/functions/locations
- **Norid**
  - https://www.norid.no/en/om-domenenavn/regelverk-for-no/
  - Vedlegg E
