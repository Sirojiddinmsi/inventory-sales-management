# CHANGELOG

## 2026-11-01 - Sotuv qatoridagi pensil (tahrirlash) tugmasi olib tashlandi

- O'zgardi: Sotuvlar ro'yxatida qatordagi pensil tugmasi yo'q. Tahrirlash nakladnoy raqamini bosganda ochiladigan oynadagi "Редактировать" tugmasi orqali qoladi.
- Sabab: egasi so'rovi — nakladnoyni bosganda tahrirlash baribir ichida bor.
- Ta'sir: faqat `SalesPage.tsx` (tugma va ishlatilmay qolgan `Edit3` importi). Qator tugmalari endi: PDF nakladnoy, qaytarish, arxiv (admin). Arxivdagi sotuvlar uchun o'zgarish yo'q.
- Testlar: typecheck o'tdi; testlar o'tdi (API 62, web 56); lokal brauzerda qator tugmalari "PDF / Возврат / В архив", nakladnoy oynasida "Редактировать" bor.
- Migration/config: yo'q.
- Rollback: shu commitni revert qilish.

## 2026-11-01 - Mahsulot qatoridagi pensil (tahrirlash) tugmasi olib tashlandi

- O'zgardi: Mahsulotlar ro'yxatida qatordagi pensil tugmasi yo'q. Tahrirlash mahsulot nomini bosganda ochiladigan oynadagi "Редактировать" tugmasi orqali qoladi.
- Sabab: egasi so'rovi — pensil keraksiz, nomni bosganda tahrirlash baribir ichida bor.
- Ta'sir: faqat `ProductsPage.tsx` (4 qator: tugma va ishlatilmay qolgan `Edit3` importi). Qator tugmalari endi: tarix, tannarx yangilash (admin), o'chirish (admin). Boshqa funksiyalar o'zgarmadi.
- Testlar: typecheck o'tdi; testlar o'tdi (API 62, web 56); lokal brauzerda qator tugmalari "история / себестоимость / удалить"; nom bosilsa oyna ochilib "Редактировать" tugmasi bor, bosilsa "Редактировать товар" formasi ochiladi.
- Migration/config: yo'q.
- Rollback: shu commitni revert qilish.

## 2026-11-01 - Mahsulotlar o'lcham/raqam bo'yicha to'g'ri tartibda (natural tartib)

- O'zgardi: mahsulot nomlari endi raqamlari son sifatida tartiblanadi: "Лапка P5, P36N, P50, P127L, P351", "Нож 2, 6, 10" (oldin "10" "6" dan oldin, "P127L" "P36" dan oldin chiqardi). Mahsulotlar ro'yxati, qidiruv natijalari, Excel eksport hamda Sotuv va Kirim oynalaridagi mahsulot tanlash ro'yxati (ular ham `sortBy=name` ishlatadi) shu tartibda.
- Sabab: ro'yxat nom bo'yicha oddiy matn taqqoslash bilan tartiblangan ("10" < "6", chunki "1" < "6"). Production'da nomlarning 884 tadan 512 tasida raqam bor.
- Qanday: `product.repository.ts` ga `naturalNameSortKey()` — nom matn va raqam bo'laklariga bo'linadi, matn kichik harfga keltirib, raqam nol bilan to'ldirilib taqqoslanadi. Bazada o'zgarish yo'q (migratsiya, kollatsiya, indeks kerak emas). Production kollatsiyasi `en_US.utf8`: avval lotin (A-Z), keyin kirill (А-Я), katta-kichik harf farq qilmaydi.
- Ta'sir: faqat `GET /products` va `/products/export-inventory.xlsx` tartiblash (`sortBy=name`). Boshqa tartiblashlar (`id`, kod, narx, qoldiq) o'zgarmadi. 884 ta mahsulotda tartiblash ifodasi tez ishlaydi (qator uchun kichik hisoblash).
- Testlar: production ma'lumotida faqat o'qish so'rovi bilan natural tartib tekshirilgan ("нож", "лапка p"); lokal API'da 13 ta o'lchamli sinov mahsuloti bilan `GET /products?search=..&sortBy=name` (asc va desc) to'g'ri tartib berdi; typecheck va testlar o'tdi (API 62, web 56). Production'da (deploydan keyin) egasi tasdiqlashi kerak.
- Migration/config: yo'q.
- **Production'ga chiqarildi: 2026-11-01 14:04 UTC**, `main` = `8adc27e`. Faqat `api` image (`tikuv-market-api:natural-sort-8adc27e`); `web` va `db` tegilmadi. API konteyneri almashganda ~15 soniya javob bermadi (502), keyin `/health` ok. Backup: `inventory_sales-20261101T140256Z.dump` (tekshirilgan). Deploydan keyin productionning o'z kodi orqali (faqat o'qish) tekshirildi: "нож" va "лапка p" qidiruvlari to'g'ri natural tartibda, jami 884 ta mahsulot.
- Rollback: `docker tag tikuv-market-api:rollback-natural-sort-20261101T140256Z tikuv-market-api:latest && docker compose -f docker-compose.prod.yml up -d --no-deps api`; eski fayl `/var/backups/tikuv-market/releases/natural-sort-before-20261101T140256Z/`.

## 2026-11-01 - Sayt faqat ruscha, UZ/RU tugmasi olib tashlandi

- O'zgardi: yuqori o'ng burchak (va kirish sahifasi)dagi UZ/RU tugmasi yo'q; sayt hamma uchun doim ruscha. Telefonda oldin saqlangan "UZ" tanlovi ham RU ga o'tadi (lokalda `inventory.language=uz` qo'yib tekshirildi).
- Qanday: `I18nProvider` ga `forcedLanguage` parametri qo'shildi (`main.tsx` da `"ru"`), `LanguageSwitch` shunda `null` qaytaradi. Tugmani qaytarish uchun `main.tsx` dagi `forcedLanguage="ru"` ni olib tashlash yetarli. `DataTable` dagi "yuklanmoqda / topilmadi" yozuvlari endi tarjima qilinadi (oldin faqat o'zbekcha edi).
- Ta'sir: `apps/web/src/contexts/I18nContext.tsx`, `main.tsx`, `components/ui.tsx`. API, baza o'zgarmadi. Excel eksport tili ham ruscha bo'ladi (`locale: language`).
- Testlar: typecheck o'tdi; testlar o'tdi (API 62, web 56; testlar o'zbekcha yozuvlarni tekshiradi, shuning uchun majburlash faqat `main.tsx` da). Lokal brauzerda Sotuv va kirish sahifalari ruscha, tugma yo'q.
- Qolgan o'zbekcha matnlar ruschaga o'tkazildi (taxminan 100 ta joy): muvaffaqiyat xabarlari, o'chirish/arxiv tasdiqlash oynalari (`ConfirmDialog` tugmalari ham), Excel import xatolari, kirish/ro'yxatdan o'tish forma xatolari, API ulanish xatosi, "Yuklanmoqda/topilmadi". Tashqi (React'dan tashqari) kod uchun `trStatic()` qo'shildi; forma tekshiruv xabarlari (zod) til o'zgarsa ham to'g'ri chiqishi uchun `error: () => ...` ko'rinishida.
- **Atayin o'zgartirilmadi:** Excel import ustun nomlari (`mahsulot nomi`, `kirim narxi`, ...): ular foydalanuvchi fayllaridagi ustunlarni topish uchun kerak. Ishlatilmaydigan `lib/format.ts` (`paymentLabels`, `debtLabels`) tegilmadi.
- **Ma'lum cheklov:** serverda yaratiladigan matnlar (PDF chek/nakladnoy, Excel hisobotlari, API xato xabarlari) tilga bog'liq tarjima qilinmagan, avvalgidek qoladi. Haqiqiy tasdiqlash oynalarining barchasi qo'lda ko'rib chiqilmagan (faqat kirish xatosi va sahifalar tekshirildi).
- Migration/config: yo'q.
- **Production'ga chiqarildi: 2026-11-01 13:55 UTC**, `main` = `0eaf59f`. Faqat `web` image (`tikuv-market-web:russian-only-0eaf59f`); `api`, `db` tegilmadi. 13 ta fayl (serverdagi nusxalari oldingi `main` bilan mazmunan bir xilligi tekshirilgan, keyin yangilari bitta paketda qo'yilgan). Backup: `inventory_sales-20261101T135405Z.dump` (tekshirilgan). Sayt 200, `/health` ok.
- Rollback: `docker tag tikuv-market-web:rollback-russian-only-20261101T135405Z tikuv-market-web:latest && docker compose -f docker-compose.prod.yml up -d --no-deps web`; eski fayllar `/var/backups/tikuv-market/releases/russian-only-before-20261101T135405Z/old-files.tar`.

## 2026-11-01 - Telefonda Mahsulotlar (va boshqa jadval) kartalari ekrandan chiqib ketishi

- O'zgardi: telefon kengligida (<=620px) jadvallar "karta" ko'rinishida ko'rsatilganda `table` blok sifatida kengligi 100% bilan chiqadi; uzun nom/joy so'zi o'ralib tushadi.
- Sabab: kartalarda `table` hamon jadval (`display: table`) edi, shuning uchun uzun bo'linmas matn (masalan uzun mahsulot nomi yoki joy "Полка-А12-Ряд-3-Ящик-7-...") jadvalni kengaytirib, butun sahifani ekrandan kengroq qilgan (lokalda 375 px ekranda hujjat kengligi 601 px bo'lib qayta hosil qilindi), kartalar filtr kartasidan o'ngga chiqib ketgan.
- Ta'sir: faqat `apps/web/src/styles.css`, 620px dan kichik ekranlardagi `.table-wrap` qoidalari (Mahsulotlar, Sotuv, Kirim, Qarz, Xarajat va boshqa jadvallar). Desktop o'zgarmadi.
- Testlar: typecheck o'tdi; testlar o'tdi (API 62, web 56). Lokal brauzerda 375 px da: uzun nomli mahsulot bilan hujjat kengligi 601 → 375; kartalar 23–352 px (ichkarida); Sotuv va Kirim sahifalari ham ekran ichida. Qarz sahifasida lokalda ma'lumot yo'q (tekshirilmagan). Haqiqiy iPhone'da sinalmagan.
- Migration/config: yo'q.
- **Production'ga chiqarildi: 2026-11-01 13:36 UTC**, `main` = `2847b3e`. Faqat `web` image (`tikuv-market-web:mobile-table-2847b3e`); `api`, `db` tegilmadi. Backup: `inventory_sales-20261101T133504Z.dump` (tekshirilgan). Sayt 200, `/health` ok.
- Rollback: `docker tag tikuv-market-web:rollback-mobile-table-20261101T133504Z tikuv-market-web:latest && docker compose -f docker-compose.prod.yml up -d --no-deps web`; eski fayl `/var/backups/tikuv-market/releases/mobile-table-before-20261101T133504Z/`.

## 2026-11-01 - Telefonda "С / По" (Dan / Gacha) sana maydonlari yonga cho'zilib ketishi

- O'zgardi: telefon kengligida (<=620px) sana/vaqt maydonlari (`date`, `datetime-local`, `time`) kartaning ichida qoladigan qilindi.
- Sabab: iPhone (Safari) mahalliy sana maydonini o'z ichki kengligi bo'yicha o'lchaydi va `.input` ning `width:100%` qoidasini hisobga olmay kartadan o'ngga chiqib ketadi; `.filters .field` da yana `min-width:150px` bor edi. Tuzatish: `appearance:none`, `min-width:0`, `max-width:100%`, `box-sizing:border-box` va sana qiymati matni chapga tekislandi.
- Ta'sir: faqat `apps/web/src/styles.css` (620px dan kichik ekranlar, 4 qator). Desktop va API o'zgarmadi. Hamma bo'limlardagi sana maydonlariga ta'sir qiladi (Sotuv, Kirim, Xarajat, Hisobot, mahsulot tarixi, formalar).
- Testlar: lokal brauzerda 375 px kenglikda Sotuvlar, Hisobotlar, Xarajatlar, Kirim sahifalarida sana maydonlari ekran ichida (29–346 px, hujjat kengligi 375). **Haqiqiy iPhone/Safari'da sinalmagan** (brauzer emulyatori Chromium; muammoning o'zi faqat Safari'da chiqadi), shuning uchun deploydan keyin telefonda tasdiqlash kerak.
- Migration/config: yo'q.
- **Production'ga chiqarildi: 2026-11-01 13:18 UTC**, `main` = `f785a8a`. Faqat `web` image (`tikuv-market-web:mobile-date-f785a8a`); `api`, `db` tegilmadi. Backup: `inventory_sales-20261101T131617Z.dump` (tekshirilgan). Production CSS'da yangi qoida bor, sayt 200, `/health` ok. (Deploy paytida SSH ulanishi ikki marta vaqtincha uzildi; server tomonda hech narsa o'zgarmagan edi, qayta urinishda o'tdi.)
- Rollback: `docker tag tikuv-market-web:rollback-mobile-date-20261101T131616Z tikuv-market-web:latest && docker compose -f docker-compose.prod.yml up -d --no-deps web`; eski fayl `/var/backups/tikuv-market/releases/mobile-date-before-20261101T131616Z/`.

## 2026-10-18 - Mahsulotlar ro'yxati alifbo bo'yicha

- O'zgardi: Mahsulotlar sahifasi (va "Excelga yuklash") endi nomi bo'yicha A→Z tartiblangan.
- Sabab: sahifa serverdan `sortBy: "id"` so'ragan; `id` tasodifiy UUID, shuning uchun tartib alifbo bo'yicha emas edi. Server `name` bo'yicha tartiblashni avvaldan qo'llab-quvvatlaydi (Sotuv va Kirim oynalari shunday ishlatadi).
- Ta'sir: faqat `apps/web/src/pages/ProductsPage.tsx` (2 qator: ro'yxat so'rovi va Excel eksport). API, baza o'zgarmadi. Tartib butun ro'yxat bo'yicha (sahifalar orasida ham), serverda hisoblanadi.
- Eslatma: tartiblash bazaning kollatsiyasiga bog'liq. Productionda `en_US.utf8`: avval lotin harflari (A-Z), keyin kirill (А-Я); katta-kichik harf farqi hisobga olinmaydi.
- Testlar: typecheck o'tdi; testlar o'tdi (API 62, web 56); lokal brauzerda 8 ta mahsulot (lotin+kirill) alifbo bo'yicha chiqdi.
- Migration/config: yo'q.
- **Production'ga chiqarildi: 2026-10-18 08:45 UTC**, `main` = `2c8a726`. Faqat `web` image (`tikuv-market-web:products-sort-2c8a726`); `api`, `db` tegilmadi. Backup: `inventory_sales-20261018T084446Z.dump` (tekshirilgan). Deploydan keyin: sayt 200 (TLS to'g'ri), `/health` ok, production `ProductsPage` chunk'ida `sortBy:name` (ro'yxat va Excel).
- Rollback: `docker tag tikuv-market-web:rollback-products-sort-20261018T084446Z tikuv-market-web:latest && docker compose -f docker-compose.prod.yml up -d --no-deps web`; eski fayl `/var/backups/tikuv-market/releases/products-sort-before-20261018T084446Z/`.

## 2026-10-17 - Telefondan mahsulot rasmi yuklashda "Server bilan bog'lanishda xatolik"

- O'zgardi: `apps/web/nginx.conf` ga `client_max_body_size 25m;` (443 server blokida).
- Sabab: nginx standart 1 MB dan kattaroq so'rovni `413` bilan rad etadi; telefon rasmi (~3.7 MB) API'ga yetib bormagan (server logi: `client intended to send too large body: 3731864 bytes`). Frontend 413 javobini umumiy "Server bilan bog'lanishda xatolik" deb ko'rsatgan. API chegarasi 4 fayl x 5 MB, shuning uchun 25 MB yetarli.
- Ta'sir: faqat nginx (web konteyner) sozlamasi; API, baza, kod o'zgarmadi. Mahsulot rasmi yuklash, kichik so'rovlar o'zgarmaydi.
- Testlar: production logidagi 413 so'rovi tahlil qilindi. Yangi image'da `nginx -t` o'tdi (sertifikatlar mount qilingan holda). Deploydan keyin autentifikatsiyasiz 4 MB POST `/api/v1/products/images` → HTTP 401 (API'ga yetdi; avval nginx 413 qaytarardi). Telefondan haqiqiy rasm bilan sinash egasiga qoldi.
- Migration/config: yo'q (nginx config web image ichida).
- **Production'ga chiqarildi: 2026-10-17 15:12 UTC**, `main` = `c0a434e`. Faqat `web` image (`tikuv-market-web:nginx-upload-c0a434e`); `api`, `db` tegilmadi. Backup: `inventory_sales-20261017T151148Z.dump` (tekshirilgan).
- Rollback: `docker tag tikuv-market-web:rollback-nginx-upload-20261017T151148Z tikuv-market-web:latest && docker compose -f docker-compose.prod.yml up -d --no-deps web`; eski config `/var/backups/tikuv-market/releases/nginx-upload-before-20261017T151148Z/`.

## 2026-10-17 - Mijozni tahrirlash (Sotuv oynasi)

- O'zgardi: Sotuv oynasida "Mijozni tanlash" ro'yxatida har bir mijoz yonida qalam tugmasi; bosilsa ism, telefon, manzil va izohni tahrirlash oynasi ochiladi.
- Sabab: yangi mijoz yaratsa bo'lardi, lekin tahrirlab bo'lmasdi (backend `PATCH /customers/:id` bor edi, frontend tugmasi yo'q edi).
- Ta'sir: faqat `SalesPage.tsx` va `styles.css`. Faqat `customers` kartochkasi yangilanadi; eski sotuv/qarzdagi ism va telefon snapshot o'zgarmaydi. Backend, migratsiya, FIFO, qarz, hisobot o'zgarmadi.
- Testlar: `npm run typecheck` - o'tdi; `npm test` - API 62 o'tdi/10 o'tkazib yuborildi (DB integratsiya), web 56/56 o'tdi. Qo'lda: eski lokal nusxada brauzer orqali yaratish -> tahrirlash -> ro'yxatda yangi nom ko'rindi. Toza `main` asosidagi nusxada qo'lda brauzer testi hali o'tkazilmagan.
- Migration/config: yo'q.
- Rollback: shu commitni revert qilish.
- Cheklov: (bartaraf etildi) takroriy telefon (409) va telefon ko'rinishi toza `main` nusxasida lokalda qo'lda tekshirildi.
- **Production'ga chiqarildi: 2026-10-17 14:39 UTC**, GitHub `main` = `3a97194` (PR #1 mijoz tahrirlash, PR #2 hujjatlar). Faqat `web` image qayta qurildi (`tikuv-market-web:customer-edit-3a97194`); `api` va `db` tegilmadi, migratsiya yo'q.
- Deploy tekshiruvi: sayt 200 (TLS to'g'ri), `/health` ok (schema `019_customer_debt_payment_batches`), yangi `SalesPage` chunk'ida "Mijozni tahrirlash" bor, API loglarida xato yo'q; egasi saytda qo'lda tekshirib tasdiqladi.
- Rollback: backup `inventory_sales-20261017T143718Z.dump` (sha256 tekshirilgan); eski image `tikuv-market-web:rollback-customer-edit-20261017T143718Z` (= `issue005-96e7a93`); eski fayllar `/var/backups/tikuv-market/releases/customer-edit-before-20261017T143718Z/`. Qaytarish: `docker tag tikuv-market-web:rollback-customer-edit-20261017T143718Z tikuv-market-web:latest && docker compose -f docker-compose.prod.yml up -d --no-deps web`.

## 2026-08-29 - ISSUE-005: Faol qarzdor modalida faqat ochiq nakladnoylarni ko'rsatish

- O'zgardi: mijoz qarzi tafsilotlari endpointi `active`, `paid`, `all` va `archive` scope'larini serverda validatsiya qilib, modalga aynan tanlangan filterga mos nakladnoylar, son va summalarni qaytaradi. Safe default `active`; eski `archived=true` so'rovi `archive` sifatida backward-compatible qoldi.
- Sabab va yechim: mijozlar ro'yxati `active`da qoldig'i bor qarzlarni filtrlasa ham, details GET faqat identity/arxiv holatini tekshirgan va modal barcha qarzlarni render qilgan. Repository scope shartlari `active = non-archived + remaining > 0`, `paid = non-archived + remaining = 0`, `all = barcha non-archived`, `archive = faqat archived` qilib ajratildi; `overdue` va `partial` modali payment uchun serverdagi barcha ochiq eligible set bilan bir xil qolishi uchun `active` details scope'iga ulanadi.
- Frontend: scope GET parametri va TanStack Query key tarkibiga kiritildi, shuning uchun filterlar orasida stale cache aralashmaydi. `paid`/`archive`da umumiy to'lov formasi yo'q; `active`/`all` preview faqat non-archived qoldig'i bor qarzlardan foydalanadi. Active scope'ni to'liq yopgan bitta muvaffaqiyatli submit modalni refetch 404 flashidan oldin toza yopadi va ikkinchi POST yubormaydi.
- Ta'sir: `debt.schema`, `debt.repository`, ularning schema/disposable-DB integration testlari, `DebtsPage`, `CustomerDebtDetailsModal` va modal testlari. `payCustomer` transaction/allocation kodi, payment audit/idempotency, stock/FIFO, return, supplier flow, cost/profit, dashboard/report va style o'zgartirilmadi.
- Testlar: fresh disposable `issue005_test` (`127.0.0.1`)da barcha 20 migration qo'llandi, bootstrap qayta yuritilganda no-op bo'ldi va `019` ledgerda bir marta qoldi; API 11 fayl/72 test, jumladan 10 DB integration test o'tdi; web 6 fayl/56 test o'tdi; monorepo typecheck, API/web production build, final root test va `git diff --check` o'tdi. Birinchi DB-enabled API urinishida testdan oldingi `JWT_SECRET` env guardi, keyingi final root urinishida to'xtagan disposable DB listener sabab suite fail bo'ldi; to'g'ri env va qayta ishga tushirilgan disposable listener bilan yakuniy run API 72/72 va web 56/56 o'tdi.
- Migration/config/dependency: yo'q. ISSUE-005 production schema yoki ma'lumot yozuvini talab qilmaydi; production smoke faqat authenticated GET bo'lishi kerak.
- Invariantlar: UUID customer isolation va faqat `customer_id IS NULL` legacy name/phone fallback saqlandi. Details GET read-only; exact-cent FIFO payment transactioni, overpay rollback, requestId idempotency, `paid_amount = SUM(debt_payments.amount)`, sale `payment_type=DEBT`, stock/FIFO/return/profit/report oqimlari o'zgarmadi va mavjud integration regressiyalaridan o'tdi.
- Rollback: shu sakkiz faylli ISSUE-005 commitini revert qilish va API/webni oldingi image/source backupiga qaytarish kifoya; database rollback yoki migration talab qilinmaydi.
- Ma'lum cheklov: foydalanuvchi lokal browser demo bosqichini bekor qildi; responsive holat va interactionlar avtomatik web testlari bilan tekshirildi, lokal manual browser smoke passed deb belgilanmadi.

## 2026-08-27 — ISSUE-004: Mijoz qarzlarini modalda ko‘rish va umumiy to‘lovni taqsimlash

- O‘zgardi: mijoz qatori `Eye` actioni endi inline `<tr>` o‘rniga compact qarz modalini ochadi; modal serverdan identity bo‘yicha barcha tegishli nakladnoylarni olib, jami/to‘langan/qoldiq, muddat/holat, individual nakladnoy actionlari va aktiv mijoz uchun bitta umumiy to‘lov formasini ko‘rsatadi.
- API: UUIDli mijozlar faqat `customer_id` bilan ajratiladi; `customer_id IS NULL` legacy qarzlargina server-normalized ism+telefon fallbackidan foydalanadi. Umumiy to‘lov barcha aktiv, arxivlanmagan qoldiqlarga `created_at ASC, id ASC` bo‘yicha bitta transactionda taqsimlanadi; ortiqcha summa 422 va full rollback beradi.
- Idempotency/audit: UUID `requestId` uchun additiv batch yozuvi va unga bog‘langan child `debt_payments` yaratildi. Bir xil request qayta yuborilganda original receipt qaytadi; boshqa payload 409 beradi. Batch child admin orqali tahrirlansa joriy debt/report qiymatlari qayta hisoblanadi, original batch receipt saqlanadi.
- Migration: `019_customer_debt_payment_batches.sql` additiv va mavjud ikkita `018` migrationga tegmaydi. Fresh `issue004_test` disposable localhost DBda barcha 20 migration qo‘llandi va `019` bevosita ikkinchi marta xatosiz bajarildi.
- Testlar: API — 11 fayl/65 test o‘tdi, jumladan disposable DBdagi 9 integration test (100/200/300→250, exact close, injected rollback, overpay no-write, archive/paid exclude, UUID collision/legacy isolation, idempotency/admin audit, barcha split/reportlar, concurrency va stock/FIFO/sale/profit/return snapshotlari); web — 6 fayl/41 test o‘tdi; monorepo typecheck, API build, web build va full test o‘tdi; `git diff --check` — whitespace xatosi topilmadi.
- Lokal demo: productionga ulanmagan `issue004_demo` (`127.0.0.1:55432`)da authenticated demo va 100k/200k/300k toza qarzlar tayyorlandi; foydalanuvchi modalni desktop va telefonda tekshirib release uchun tasdiqladi. Finalizatsiyada demo payment yuborilmadi.
- Invariantlar: integration tekshiruvida `paid_amount = SUM(debt_payments.amount)`, qoldiq/status va payment splitlari aniq qoldi; stock, FIFO layer/allocation, sale `payment_type=DEBT`, cost/profit va return snapshotlari paymentdan oldin/keyin teng bo‘ldi.
- Rollback: approvalgacha target worktree diffini va disposable DB/runtime’ni olib tashlash mumkin; auditor/preserved worktree o‘zgarmagan. Keyingi git bosqichida faqat revert ishlatiladi; productionda additiv schema data paydo bo‘lsa migration tablelarini drop qilish rejalashtirilmagan.
- Ma’lum cheklov: Browser connector mavjud bo‘lmagani uchun 1366 va 360/390/430 vizual overflow hamda Network one-POST smoke avtomatlashtirilmagan va passed deb belgilanmagan; desktop/mobile ko‘rinish foydalanuvchi tomonidan manual tasdiqlangan. Release commitidan oldin production deploy/migration bajarilmagan.

## 2026-08-24 — ISSUE-003: Supplier return tafsilotlarini modalda ko‘rsatish

- O‘zgardi: yetkazib beruvchiga qaytarish hujjati mahsulotlari inline jadval qatori o‘rniga read-only modalda ochiladi.
- Sabab: `expandedReturnDocumentIds` va conditional detail `<tr>` return tafsilotlarini asosiy jadval ichida yoyib, keyingi hujjat/actionlar bilan vizual chalkashlik yaratgan.
- Ta’sir: faqat purchases frontend state/renderi, yangi `SupplierReturnDetailsModal`, scoped details CSS va render testlari.
- Testlar: `npm.cmd run test --workspace @inventory/web` — 5 test fayl, 34 test o‘tdi; `npm.cmd run typecheck --workspace @inventory/web` — o‘tdi; `npm.cmd run build --workspace @inventory/web` — o‘tdi; `npm.cmd run test` — API 9 fayl/42 test va web 5 fayl/34 test o‘tdi; `npm.cmd run typecheck` — API va web o‘tdi; lokal demo - foydalanuvchi supplier return modal ko`rinishini tasdiqladi; demo API logida bitta DELETE /api/v1/supplier-returns/documents/... write so`rovi kuzatildi, shuning uchun read-only smoke sharti to`liq tasdiqlanmadi.
- Migration/config: yo‘q.
- Ma’lumot xavfi: API/database, stock/FIFO, supplier return allocationlari, qarz/payment va report hisoblari o‘zgartirilmagan.
- Rollback: ISSUE-003 frontend component/state/CSS/test/CHANGELOG diffini qaytarib, eski inline renderni tiklash; database rollback talab qilinmaydi.
- Ma`lum cheklov: avtomatik browser screenshot/Network smoke bajarilmadi; lokal demo foydalanuvchi tomonidan manual tasdiqlandi, ammo API logda bitta lokal supplier return DELETE write so`rovi qayd etildi.

## 2026-08-21 — ISSUE-002: Tafsilot modallarining mobil joylashuvini ixchamlashtirish

- O‘zgardi: sotuv va kirim tafsilotlari modalining telefon ekranidagi meta, gorizontal summary-card mahsulot ro‘yxati va 2x2 footer joylashuvi ixchamlashtirildi.
- Sabab: details modallari mobil ekranda field-grid mahsulot maydonlariga tushib, bitta mahsulot kartasini keraksiz baland qilgan; read-only tafsilot uchun ixcham summary-card kompozitsiyasi yetarli.
- Ta’sir: faqat `SaleDetailsModal`, `PurchaseDetailsModal`, ularning scoped CSS qoidalari va render testlari.
- Testlar: `npm.cmd run test --workspace @inventory/web` — 4 test fayl, 27 test o‘tdi; `npm.cmd run typecheck --workspace @inventory/web` — o‘tdi; `npm.cmd run build --workspace @inventory/web` — o‘tdi; lokal demo — foydalanuvchi 2026-08-21 kuni Kirim va Sotuv mobil modal ko‘rinishini tasdiqladi; `git diff --check` — whitespace xatosi topilmadi.
- Migration/config: yo‘q.
- Ma’lumot xavfi: API/database, stock/FIFO, qarz, return va report hisoblari o‘zgartirilmagan.
- Rollback: ISSUE-002 frontend/CSS/test/CHANGELOG diffini qaytarish; database rollback talab qilinmaydi.
- Ma’lum cheklov: Browser connector mavjud bo‘lmagani uchun avtomatik 320/360/390px screenshot smoke bajarilmadi; lokal ko‘rinish foydalanuvchi tomonidan manual tasdiqlandi.

## 2026-08-21 — ISSUE-001: Kirim tafsilotlarini modalda ko‘rsatish

- O‘zgardi: kirim hujjati mahsulotlari inline yoyilish o‘rniga read-only modalda ochiladi.
- Sabab: `expandedDocumentIds` va shartli detail `<tr>` tafsilotlarni jadval ichida render qilgan.
- Ta’sir: faqat purchases frontend ko‘rinishi, yangi modal komponenti, modalga oid CSS va render testlari.
- Testlar: `npm.cmd run typecheck --workspace @inventory/web` — o‘tdi; `npm.cmd run test --workspace @inventory/web` — 3 test fayl, 19 test o‘tdi; `npm.cmd run build --workspace @inventory/web` — o‘tdi; `npm.cmd run test` — API 9 fayl/42 test va web 3 fayl/19 test o‘tdi; `npm.cmd run typecheck` — API va web o‘tdi; headless Edge CSS fixture — desktop modal width 1040px va gorizontal scroll yo‘q, mobil body scroll mavjud; lokal demo — foydalanuvchi desktop modal ko‘rinishini ma’qulladi; `git diff --check` — whitespace xatosi topilmadi.
- Migration/config: yo‘q.
- Ma’lumot xavfi: API/database va stock/FIFO hisoblari o‘zgartirilmagan.
- Rollback: modal komponent/state ulanishini bekor qilib, oldingi inline renderni tiklash; database rollback talab qilinmaydi.
- Ma’lum cheklov: Browser connector mavjud bo‘lmagani uchun Network panel va screenshot avtomatlashtirilgan tekshiruvi bajarilmadi; demo vaqtida lokal API logda POST `/api/v1/products` va POST `/api/v1/purchases/bulk` kuzatildi, shuning uchun read-only smoke sharti to‘liq tasdiqlanmadi.
