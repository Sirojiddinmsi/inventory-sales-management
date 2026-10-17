# Arxitektura

## Umumiy ko'rinish
```
Brauzer ──HTTPS──> nginx (web konteyner, 80/443)
                     ├─ /            → React SPA (statik, apps/web/dist)
                     ├─ /api/        → api:4000  (Express)
                     ├─ /uploads/, /media/ → api:4000 (mahsulot rasmlari)
                     └─ /health, /healthz
api (Node 24, Express 5) ──> db (PostgreSQL 17)
```
Monorepo (npm workspaces): `apps/api` (`@inventory/api`) va `apps/web` (`@inventory/web`).
Production: 3 ta Docker konteyner (`db`, `api`, `web`) — `deploy/docker-compose.prod.yml`. Lokal: `docker-compose.yml` yoki portable Postgres (`scripts/start-local.ps1`).

## Stack
- Frontend: React 19, TypeScript, Vite, TanStack Query, React Router, Recharts, lucide-react. UZ/RU tili (`contexts/I18nContext.tsx`, `tr("uz","ru")` yordamchisi).
- Backend: Node, Express 5, TypeScript, Zod (validatsiya), `pg` (ORM yo'q, sof SQL), JWT, bcryptjs, PDFKit, Excel (`read-excel-file`, `write-excel-file`).
- Test: vitest (API va web). API'da DB integratsiya testlari bor (vaqtinchalik lokal DB kerak).
- Rollar: `ADMIN`, `SELLER`. Admin faqat: kategoriyalar, sozlamalar, foydalanuvchilar, arxiv/o'chirish va h.k.

## Backend tuzilishi (`apps/api/src`)
Har bir modul: `schema` (Zod) → `controller` (HTTP) → `service` (qoida) → `repository` (SQL) → `routes`.
```
app.ts, server.ts             Express sozlash, ishga tushirish
config/                       env.ts (Zod bilan .env tekshiruvi), database.ts (pg pool)
middlewares/                  auth (JWT + har so'rovda userni DB'dan tekshirish), error
routes/index.ts               /api/v1 ostidagi barcha routerlar; /auth dan boshqasi authenticate talab qiladi
modules/
  auth/            login, setup (birinchi admin), users, profil, parol
  products/        mahsulot CRUD, Excel import, rasm yuklash/qayta ishlash, FIFO tannarx tuzatish (+undo)
  categories/, units/, settings/
  contacts/        suppliers VA customers — bitta modul (`/suppliers`, `/customers` bir xil router)
  purchases/       kirim (prixod), hujjatlar, tahrirlash (audit), PDF/Excel eksport
  supplier-returns/ yetkazib beruvchiga qaytarish
  sales/           sotuv, tahrirlash, qaytarish, arxiv/tiklash, PDF chek
  debts/           qarzlar, to'lovlar, mijoz bo'yicha umumiy to'lov taqsimoti (debt-allocation.ts)
  inventory/       fifo.repository.ts — FIFO partiyalar bilan ishlash (yadro!)
  expenses/, reports/, dashboard/
shared/                       AppError, pagination, validation, archive-cleanup (30 kunlik avto-tozalash)
```
Muhim: stock/pulga ta'sir qiladigan hamma amal **bitta DB tranzaksiyasi** ichida. Sotuvda mahsulot qatorlari `FOR UPDATE` bilan lock qilinadi (oversell oldini olish).

## Frontend tuzilishi (`apps/web/src`)
- `App.tsx` — marshrutlar: `/products, /categories(A), /purchases, /sales, /debts, /expenses, /reports, /settings(A), /profile, /change-password`, `/login`, `/register` (A = faqat ADMIN).
- `pages/` — har bir sahifa bitta katta fayl (`PurchasesPage.tsx` ~2100 qator, `ProductsPage.tsx` ~1850, `SalesPage.tsx` ~1650, `DebtsPage.tsx` ~820; ichida modal/forma/mobil mantiq). Ularni bo'lish — kelajakdagi refactor, hozir so'ralmaguncha qilinmaydi.
- `components/` — `AppShell` (sidebar/topbar), `ui.tsx` (Button, Input, Modal, DataTable…), tafsilot modallari (`SaleDetailsModal`, `PurchaseDetailsModal`, `SupplierReturnDetailsModal`, `CustomerDebtDetailsModal`, `ProductDetailsModal`).
- `lib/api.ts` — fetch o'rami; `lib/*.ts` — format, kassa hisoboti, Excel import, rasm URL yordamchilari.
- `types/api.ts` — API javob turlari.
- `styles.css` — yagona global CSS (~1900 qator). Mobil qoidalar `@media` ichida; `purchase-*`, `sale-*` prefikslari.
- Mobil: sotuv va kirim formalari telefon uchun alohida karta ko'rinishiga ega (qatorlar yig'iladi/ochiladi).

## Ma'lumotlar bazasi
Migratsiyalar `database/migrations/` (tartib bo'yicha, `scripts/bootstrap-db.mjs` ularni API konteyner ishga tushganda qo'llaydi va `schema_migrations` jadvalida kuzatadi). Seed — `database/seeds/001_default_data.sql` (faqat bir marta, `seed_migrations` orqali).

| # | Mazmuni |
|---|---|
| 001 | Asosiy jadvallar: users, products, categories, purchases, sales, sale_items, debts, debt_payments, expenses, suppliers, customers, settings |
| 002 | Sotuv qaytarishlari (`sale_returns`), sotuv/qarz arxivi, `product_images` |
| 003 | Mahsulotni butunlay o'chirish (partial unique index: faol mahsulot kodi) |
| 004 | `measurement_units`, sotuv birligi konversiyasi |
| 005 | Mahsulot joylashuvi (location) |
| 006 | **FIFO**: `inventory_batches`, `sale_item_batch_allocations`, `fifo_cost` ustunlari |
| 007 | Foydalanuvchi profili (`profile_image_url`) |
| 008 | Sotuv sanalari, qarz to'lov usullari |
| 009 | Kirim tahrirlash auditi |
| 010–011 | Yetkazib beruvchiga qaytarish (`supplier_returns`, birlik narxi, o'chirish) |
| 012 | Mahsulot rasmlari DB'da saqlanadi (`product_image_files`) |
| 013–014 | Kirim hujjatlari (`purchase_documents`), eski kirimlarni guruhlash |
| 015 | Qaytarish hujjatlari |
| 016 | Qarz statusini normallashtirish |
| 017 | FIFO tannarx tuzatishlari (`fifo_cost_corrections`) |
| 018 (x2) | Qarz to'lovi tahrir auditi; FIFO tuzatishni bekor qilish — **ikkita 018 bor, bu atayin qoldirilgan, ularni qayta nomlama** (production'da qo'llangan) |
| 019 | `debt_payment_batches` — mijoz bo'yicha umumiy to'lov (ISSUE-004) |

Asosiy bog'lanishlar: `sales → sale_items → sale_item_batch_allocations → inventory_batches ← purchases/purchase_documents`; `sales → debts → debt_payments`; `sales → sale_returns`.

## Fayl saqlash
Mahsulot rasmlari: yuklanganda WebP'ga qayta ishlanadi (`product-image.processing.ts`, maks 2 MB) va **bazaning o'zida** `product_image_files.data` (BYTEA) ga saqlanadi; API `/media/product-images/...` orqali beradi (`product-image.storage.ts`). Demak rasmlar DB backup ichida bor. Production'da `./uploads` papkasi ham mount qilingan (eski `/uploads/products` fayllari uchun; migratsiya 012 eski lokal yo'llarni tozalagan).

## Muhit o'zgaruvchilari (`.env.example` ga qarang)
`NODE_ENV, PORT, DATABASE_URL, JWT_SECRET (>=32 belgi), JWT_EXPIRES_IN, CORS_ORIGIN, PUBLIC_API_URL, APP_TIMEZONE=Asia/Tashkent, RATE_LIMIT_*, POSTGRES_*, VITE_API_URL`.
Production `.env` faqat serverda (`/opt/tikuv-market/.env`), repoga kirmaydi.

## Hosting tarixi
Render (`render.yaml`) — eski/zaxira sozlama; hozirgi production **Hetzner** (`95.216.184.39`). `render.yaml` ishlatilmaydi.
