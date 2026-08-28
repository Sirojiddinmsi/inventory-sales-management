# CHANGELOG
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
