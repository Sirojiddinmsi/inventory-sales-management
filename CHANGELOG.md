# CHANGELOG

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
