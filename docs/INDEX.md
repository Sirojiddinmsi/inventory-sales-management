# Hujjatlar ro'yxati

| Fayl | Nima uchun |
|---|---|
| [`../AGENTS.md`](../AGENTS.md) | Ishlash qoidalari (birinchi shuni o'qing) |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Sayt qanday tuzilgan: modullar, jadvallar, migratsiyalar, frontend |
| [`BUSINESS_RULES.md`](BUSINESS_RULES.md) | Buzilmasligi shart biznes qoidalari: FIFO, qarz, qaytarish, sotuv |
| [`DEPLOY.md`](DEPLOY.md) | Server, deploy, backup, rollback, "global sayt buzilsa" ro'yxati, lokal ishga tushirish |
| [`OPEN_ISSUES.md`](OPEN_ISSUES.md) | Ochiq masalalar, noaniq joylar, ma'lum xavflar |
| [`API.md`](API.md) | API endpointlari (eskirgan bo'lishi mumkin; haqiqat — `apps/api/src/modules/*/*.routes.ts`) |
| [`../CHANGELOG.md`](../CHANGELOG.md) | Har bir o'zgarish tarixi (eng yangisi tepada) |
| [`../deploy/`](../deploy) | Serverda ishlatiladigan skript/konfiglar (maxfiy qiymatlarsiz) |

## CHANGELOG yozuv formati
```md
## YYYY-MM-DD — ISSUE-XXX: Qisqa nom
- O'zgardi: ...
- Sabab: ...
- Ta'sir: (qaysi modul/fayllar)
- Testlar: (haqiqiy natija)
- Migration/config: yo'q yoki aniq
- Rollback: ...
- Cheklov: (tekshirilmagan qism)
```

## Hozirgi holat (2026-10-17, zaxira asosida)
- `main` = `96e7a93` (ISSUE-005) = GitHub'dagi `main` = productiondagi kod (solishtirilgan, farq faqat 2 ta test fayl).
- Production bazasi schema versiyasi: `019_customer_debt_payment_batches` (20 migratsiya fayli).
