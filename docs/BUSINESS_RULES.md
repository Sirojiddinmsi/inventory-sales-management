# Biznes qoidalari (buzilmasligi shart)

Bular moliyaviy/ombor hisobiga tegadi. Shu sohalarga tegadigan har qanday o'zgarishdan oldin reja + egasidan ruxsat. Manba: `ombor.md` (eski loyiha xotirasi), CHANGELOG va kod.

## Ombor va kirim (prixod)
- Stock har doim mahsulotning **asosiy birligida** saqlanadi. Stock izohsiz manfiy bo'lmasin.
- Har bir kirim alohida **FIFO partiya** (`inventory_batches`): boshlang'ich miqdor, qolgan miqdor, kirim narxi, sana, manba (`PURCHASE` oddiy kirim, `IMPORT` Excel, `OPENING` boshlang'ich qoldiq, `ADJUSTMENT` qo'lda).
- Kirim hujjati bir nechta qatordan iborat (`purchase_documents`). Eski sana bilan kirim mumkin. Kirimni tahrirlash/o'chirish stock va FIFO'ni qayta hisoblaydi (audit: `purchase_audit_logs`); sotuvda ishlatilgan partiya bilan bog'liq o'zgarishlar cheklangan.
- Mahsulot sotuvga bog'langan bo'lsa o'chirilmaydi (`PRODUCT_HAS_SALES`). Bu blokni olib tashlama.

## FIFO va tannarx
- Tannarx **faqat FIFO** bilan: eng eski mavjud partiya birinchi sarflanadi, qisman sarflangan partiyaning qoldig'i aniq saqlanadi. O'rtacha tannarx ishlatilmaydi.
- `sale_item_batch_allocations` — har bir sotuv qatori qaysi partiyadan qancha va qanday narxda olgani. Sotuvning `fifo_cost` = shu allocationlar yig'indisi.
- **Foyda = sotuv summasi − fifo_cost.** Net foyda = foyda − xarajatlar (`expenses`).
- Qisman qaytarishda mahsulot va tannarx o'sha sotuvning **original** partiyalariga qaytadi.
- Sotuv arxivlanganda sotilgan miqdor partiyalarga qaytadi; tiklanganda hozirgi partiyalardan qayta FIFO allocation qilinadi (stock yetarli bo'lishi shart).
- Edit/delete/orqa sana operatsiyalari FIFO qatlamlarini izchil qayta tiklashi kerak.
- Admin "FIFO tannarx tuzatish" va uni **bekor qilish** (undo) bor (`fifo-cost-correction*`); undo faqat xavfsizlik tekshiruvlaridan o'tsa.
- Misol: kirim 10×20 000, 10×22 000, 10×25 000; 15 dona 30 000 dan sotildi → tannarx 10×20 000 + 5×22 000 = 310 000; sotuv 450 000; foyda 140 000.

## Sotuv va nakladnoy (invoice)
- Bitta nakladnoyda bir nechta mahsulot. Narx qat'iy emas: mahsulotdagi `sale_price` faqat tavsiya; har qatorda boshqa narx, qator chegirmasi va umumiy chegirma bor.
- To'lov turlari: `CASH` (Наличные), `CARD` (Карта), `DEBT` (В долг). (Qarz to'lovlarida usul: Наличные/Карта/Перевод.)
- Sotuv paytida mahsulot qatorlari lock qilinadi; stock yetmasa rad etiladi.
- Sotuv birligi asosiydan farq qilsa konversiya (1 quti = 10 dona) — stock asosiy birlikda kamayadi.
- Nakladnoy raqamini bosganda read-only tafsilot (`SaleDetailsModal`) ochiladi; PDF/Excel, edit, delete, return ishlashda davom etishi shart.
- Qaytarish bor sotuvni tahrirlash bloklangan. Arxiv — faqat ADMIN, 30 kun saqlanadi (keyin avto-o'chadi), tiklash mumkin; butunlay o'chirish stockni qayta o'zgartirmaydi.

## Qarz va to'lov
- `В долг` sotuv qarz (`debts`) yaratadi; original to'lov turi keyingi to'lovlardan keyin ham `DEBT` bo'lib qoladi.
- To'lovlar **alohida audit qilinadigan yozuv** (`debt_payments`); original sotuvni almashtirmaydi. Qisman/to'liq; ortiqcha to'lov rad etiladi. Statuslar: `UNPAID`, `PARTIALLY_PAID`, `PAID`.
- Invariant: `debts.paid_amount = SUM(debt_payments.amount)`; qoldiq va status shundan kelib chiqadi.
- Mijoz bo'yicha **umumiy to'lov** (ISSUE-004): bitta summa barcha faol qarz nakladnoylarga `created_at ASC, id ASC` tartibida bitta tranzaksiyada taqsimlanadi; ortiqcha → 422 + to'liq rollback; `requestId` (UUID) bilan idempotent (qayta yuborilsa original chek qaytadi, boshqa payload → 409). Jadvallar: `debt_payment_batches` + bog'langan `debt_payments`.
- Mijoz identifikatsiyasi: UUID `customer_id` bilan; faqat `customer_id IS NULL` eski qarzlar uchun ism+telefon fallback.
- To'lovni tahrirlash/o'chirish qoldiq va hisobotlarni izchil yangilaydi (`debt_payment_audit_logs`).
- Qarz arxivi/tiklash/butunlay o'chirish — faqat ADMIN; sotuv bilan arxivlangan qarzni tiklashdan oldin sotuv tiklanadi.
- Qaytarish: qarzli sotuvda qarz summasi ham kamayadi, lekin allaqachon to'langan summadan pastga tusha olmaydi; to'liq qaytarilgan to'lanmagan qarz yozuvi o'chadi.

## Hisobotlar
- Dashboard/report arxivlangan sotuv va qarzlarni **hisoblamaydi**, qaytarishdan keyingi **net** summa/foydani ishlatadi. Bir xil filtr va davr = bir xil natija.
- `Topshiriladigan summa (Amount to Submit) = total_fifo_cost`.
- Excel export va brauzerdan chop etish mavjud.

## Mijoz ma'lumotlari
- `sales.customer_name/phone` va `debts.customer_name/phone` — sotuv paytidagi **snapshot** (ism keyin `customers`da o'zgarsa eski nakladnoyda o'zgarmaydi). Bu ataylab; o'zgartirish alohida qaror (qarz/hisobotga ta'sir qiladi).

## Pul va vaqt
- Pul `numeric`; binary float yo'q. Valyuta UZS. Vaqt zonasi `Asia/Tashkent` (APP_TIMEZONE, DB `TZ`).
