# AGENTS.md — Tikuv Market (ishchi qoidalar)

Bu fayl shu loyihada ishlaydigan har bir AI-agent yoki dasturchi uchun. Avval shuni, keyin `docs/INDEX.md` ni o'qing.
(Qisqa va amaliy; kerak bo'lsa egasi bilan birga yangilanadi.)

## Loyiha nima
Tikuv mashinasi ehtiyot qismlari do'koni uchun ombor + savdo + qarz + hisobot tizimi.
Global sayt: `https://95.216.184.39/` (Hetzner, Docker Compose). Kod: GitHub `Sirojiddinmsi/inventory-sales-management`, branch `main`.

**`main` = productionda ishlayotgan kod.** Bu shunday qolishi kerak. Productionda bor, lekin GitHub'da yo'q kod bo'lmasligi shart.

## Oltin qoidalar
1. **Production va uning bazasiga egasining aniq ruxsatisiz tegma.** Deploy, push, force-push, production bazada yozish/test — faqat "shuni qil" deyilganda.
2. **Hamma ish GitHub orqali izlanadigan bo'lsin.** Ish commit qilinmay qolmasin (oldin shu sabab invoice tafsiloti productiondan yo'qolgan, qarang `docs/OPEN_ISSUES.md`). Har bir ish alohida branch'da: `fix/...`, `feat/...`, `chore/...`.
3. **Xavfli sohalar** — sales, stock/ombor, FIFO tannarx, qarz/to'lov, qaytarish (return), hisobot/foyda, migratsiya, auth: o'zgartirishdan oldin qisqa yozma reja + egasidan "davom et" kuting. Biznes qoidalari `docs/BUSINESS_RULES.md` da.
4. **Migratsiyani hech qachon tahrirlama** — faqat yangi raqamli fayl qo'sh (`database/migrations/0NN_*.sql`). Additiv bo'lsin. Production'da qo'llashdan oldin backup.
5. **Pulni floatda hisoblama.** Pul/tannarx PostgreSQL `numeric` + mavjud yordamchilar bilan.
6. **Maxfiy ma'lumot** (`.env`, parol, JWT_SECRET, SSH kalit, token) hech qachon commit, log yoki hujjatga yozilmaydi.
7. **Faqat so'ralgan ishni qil.** Qo'shimcha refactor/dizayn yo'q. Muhim topilma bo'lsa — alohida aytib, `docs/OPEN_ISSUES.md` ga yoz.
8. **Noaniq bo'lsa so'ra.** Taxmin bilan moliyaviy logikaga tegma.
9. **Test natijasini rost yoz.** O'tmagan/ishga tushmagan testni "o'tdi" deb aytma.

## Buyruqlar (loyiha ildizida)
```bash
npm ci                    # bir marta (Node >=22; sinalgan: 24)
npm run typecheck         # API + web
npm test                  # API + web (vitest)
npm run build             # API (tsc) + web (vite)
```
- API integratsiya testlari vaqtinchalik (disposable) lokal DB talab qiladi — production DB'ga hech qachon ulama.
- Lokal ishga tushirish: `docs/DEPLOY.md` → "Lokal ishga tushirish".
- API'ni `.env` bilan ishga tushirishda ishchi papka loyiha **ildizi** bo'lsin (`dotenv` shu yerdan o'qiydi): `npx tsx apps/api/src/server.ts`.
- Web: `cd apps/web && npx vite --host 127.0.0.1`.

## Ish tartibi (tavsiya)
1. `git status`, `git log -3` — holatni bil. `main` dan yangi branch och.
2. Muammoni aniq tushun (kerak bo'lsa egasidan so'ra), tegiladigan fayllarni top.
3. Eng kichik xavfsiz o'zgarish → typecheck + test.
4. Lokalda brauzerda ko'rsat, egasi tasdiqlasin.
5. `CHANGELOG.md` ga yozuv (format `docs/INDEX.md` oxirida), commit (aniq nom: `fix: ...`).
6. Egasi aytgandagina: push → PR → deploy (`docs/DEPLOY.md`: backup, deploy, smoke test, rollback).
7. Deploydan keyin `main` productionga teng ekanini tekshir.

## Til
Egasi bilan o'zbek tilida (lotin) gaplash. Kod, commit nomlari ingliz tilida; CHANGELOG o'zbekcha.
