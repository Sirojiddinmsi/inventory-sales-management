# CHANGELOG

## 2026-08-21 — ISSUE-001: Kirim tafsilotlarini modalda ko‘rsatish

- O‘zgardi: kirim hujjati mahsulotlari inline yoyilish o‘rniga read-only modalda ochiladi.
- Sabab: `expandedDocumentIds` va shartli detail `<tr>` tafsilotlarni jadval ichida render qilgan.
- Ta’sir: faqat purchases frontend ko‘rinishi, yangi modal komponenti, modalga oid CSS va render testlari.
- Testlar: `npm.cmd run typecheck --workspace @inventory/web` — o‘tdi; `npm.cmd run test --workspace @inventory/web` — 3 test fayl, 19 test o‘tdi; `npm.cmd run build --workspace @inventory/web` — o‘tdi; `npm.cmd run test` — API 9 fayl/42 test va web 3 fayl/19 test o‘tdi; `npm.cmd run typecheck` — API va web o‘tdi; headless Edge CSS fixture — desktop modal width 1040px va gorizontal scroll yo‘q, mobil body scroll mavjud; lokal demo — foydalanuvchi desktop modal ko‘rinishini ma’qulladi; `git diff --check` — whitespace xatosi topilmadi.
- Migration/config: yo‘q.
- Ma’lumot xavfi: API/database va stock/FIFO hisoblari o‘zgartirilmagan.
- Rollback: modal komponent/state ulanishini bekor qilib, oldingi inline renderni tiklash; database rollback talab qilinmaydi.
- Ma’lum cheklov: Browser connector mavjud bo‘lmagani uchun Network panel va screenshot avtomatlashtirilgan tekshiruvi bajarilmadi; demo vaqtida lokal API logda POST `/api/v1/products` va POST `/api/v1/purchases/bulk` kuzatildi, shuning uchun read-only smoke sharti to‘liq tasdiqlanmadi.
