# Ochiq masalalar va noaniq joylar

Yangilangan: 2026-10-17. Bajarilganini o'chirmang — "Hal qilindi" bo'limiga o'tkazing.

## Egasi bergan topshiriqlar (kamchiliklar)
1. **Mijozni tahrirlash.** Sotuv oynasida yangi mijoz yaratsa bo'ladi, tahrirlab bo'lmaydi (backend `PATCH /customers/:id` bor, frontend tugmasi yo'q). Taklif: mijoz tanlash ro'yxatida qalam tugmasi + tahrirlash modali (faqat `customers` kartochkasi; eski sotuv/qarzdagi ism snapshot o'zgarmaydi). *Holat: lokalda yozilib ishlashi tekshirilgan, productionga chiqmagan; patch `00_CLEAN_PROJECT/_salvage/old-local-uncommitted.diff` ichidagi `SalesPage.tsx` qismida — toza `main` ustiga qayta qo'llash kerak.*

## Ma'lum xavflar / texnik qarz
- **Backup faqat serverning o'zida.** Server yoki disk yo'qolsa DB ham yo'qoladi. Taklif: kunlik tashqi nusxa (masalan boshqa joyga shifrlangan). Hozir ixtiyoriy qo'lda nusxa (`02_Databases`).
- **Ikkita `018` migratsiya** (`018_debt_payment_edit_audit`, `018_fifo_cost_correction_undos`). Production'da qo'llangan; nomini o'zgartirma. Yangi migratsiya — `020_...`.
- **Production `docker-compose.prod.yml` oldin repoda yo'q edi** (endi `deploy/` da). Serverdagi nusxa bilan bir xilligini vaqti-vaqti bilan tekshiring.
- **Deploy qo'lda** va aniq buyruq hujjatlanmagan (`DEPLOY.md` ⚠️ qismlari). Deployni skriptga (`deploy/deploy.sh`) aylantirish taklif etiladi.
- **Katta fayllar:** `PurchasesPage.tsx` (~2100), `ProductsPage.tsx` (~1850), `SalesPage.tsx` (~1650 qator) va yagona `styles.css`. Kichik o'zgarish ham xavfli bo'lishi mumkin; refactor faqat so'ralganda.
- **Mijoz ismi snapshot** (`sales`/`debts` da nusxa): customers'da ism o'zgarsa eski nakladnoy/qarzlarda eski ism qoladi. Bu qarorni egasi bilan kelishish kerak.
- **Web healthcheck doim `unhealthy`** (2026-10-17 tekshirildi): konteyner ichidagi `wget https://127.0.0.1/healthz` IP-sertifikatni 127.0.0.1 uchun tekshira olmaydi (`certificate verify failed`). Sayt aslida ishlaydi; bu faqat noto'g'ri healthcheck. Tuzatish: healthcheck'ni `http://127.0.0.1:80/healthz` o'rniga HTTPS'ni `--no-check-certificate` bilan yoki nginx'da `/healthz` ni 80-portda redirectsiz berish (alohida kichik ish).
- **HTTPS — Let's Encrypt "shortlived" IP sertifikat** (~6 kun amal qiladi). Yangilanish **avtomatik**: `snap.certbot.renew.timer` kuniga bir necha marta ishlaydi, `webroot` (`/var/www/certbot`), yangilangach `/etc/letsencrypt/renewal-hooks/deploy/reload-tikuv-market-web.sh` nginx'ni reload qiladi (2026-10-17 tekshirildi: sertifikat 2026-10-21 gacha, keyingi yangilanish oynasi 10-17 23:47–10-18 02:58 UTC). Risk: certbot/snap to'xtasa yoki `:80` yo'li (`/.well-known/acme-challenge/`) buzilsa sayt ~6 kunda "xavfsiz emas" bo'lib qoladi. Deploydan keyin `certbot certificates` va `/.well-known/acme-challenge/` yo'li ishlashini tekshiring. Domen olinsa muddat 90 kunga chiqadi.
- **Eski mahsulot rasm URL'lari:** ba'zi mahsulotlarda to'liq `https://95.216.184.39/media/...` ko'rinishidagi URL bor; HTTP sahifada brauzer bloklashi mumkin. Eski lokal frontend tuzatishi (`lib/productImage.ts`) bor edi, productionga chiqmagan (`_salvage/old-local-uncommitted.diff`).
- **Testlar:** `debt.repository.integration.test.ts` DB talab qiladi; production'ga ulangan holda ishga tushirilmasin. Zaxiradagi production nusxasida 2 ta test fayl (`debt.repository.integration.test.ts`, `debt.schema.test.ts`) `main` dagidan qisqaroq (eski ISSUE-004 versiyasi); ishlaydigan kod esa bir xil. Ya'ni serverga faqat testlarning eski versiyasi tushgan — zararsiz, lekin serverdagi nusxa `main` bilan to'liq bir xil emas.
- **npm audit** ogohlantirishlari bor (`npm ci` chiqishida); dependency yangilash alohida ish.

## Tashlab ketilgan / tugallanmagan ishlar (arxivdan)
- `_salvage/old-local-uncommitted.diff`: eski lokal papkadagi commit qilinmagan ish (Sotuv sahifasi, AppShell, ProductDetailsModal, productImage, styles; plus `SaleDetailsModal.tsx`). Qisman productionga allaqachon `11c36a3 restore sale invoice details` bilan chiqqan; qolgani tekshirilmagan — **ko'r-ko'rona qo'llamang**, qismlarga ajratib ko'ring.
- Branch'lar: `codex/issue-004-customer-debt-payments`, `codex/issue-005-active-debt-scope` — ikkalasi ham `main` ga kirgan (main = ISSUE-005).

## Savollar va ularga javoblar (egasi "o'zing hal qil" dedi; 2026-10-17)
| Savol | Aniqlangan / qabul qilingan qaror |
|---|---|
| Deploy qanday? | **Aniqlandi:** serverdagi `/opt/tikuv-market` da `.git` **yo'q** — kod fayl sifatida ko'chiriladi, so'ng Docker image qayta build qilinadi. Har deployda o'zgargan fayllar va eski image ID `.deploy-backups/<UTC>/` ga saqlangan. Sabab: shu usul tufayli serverdagi kod GitHub'dan ajralib qolishi mumkin (bir marta shunday bo'lgan, serverda `.deployment-quarantine-20260816-46c727a/` da yig'ilib qolgan fayllar bor). **Qaror:** keyingi deploydan boshlab serverga faqat `main` dan yig'ilgan kod chiqariladi (tar/`git archive` orqali), serverda `DEPLOYED_COMMIT` fayli yoziladi. Aniq buyruqni birinchi deployda serverni **faqat o'qish rejimida** ko'rib tasdiqlaymiz (egasi ruxsati bilan). |
| GitHub'ga kirish? | **Aniqlandi:** bu kompyuterda (`admim`) git credential, SSH kalit va `gh` **yo'q**; global `user.name/email` ham yo'q. Eski kompyuterdagi (`mssi`) kirish ko'chmagan. **Qaror:** push kerak bo'lganda egasi bir marta GitHub'da *fine-grained token* (faqat shu repo, Contents: read/write) yoki `gh auth login` qiladi; token hech qachon faylga/chatga yozilmaydi. Shu paytgacha hamma ish lokal commit + branch. |
| Domen nomi? | Egasi qaror qilmadi. **Tavsiya:** domen (yiliga ~$10) olib, IP sertifikat o'rniga oddiy Let's Encrypt ishlatish — brauzer ogohlantirishlari va sertifikat yangilanishi osonlashadi. Majburiy emas; hozirgi IP orqali ishlayapti. |
| Tashqi backup? | Egasi qaror qilmadi. **Tavsiya:** kunda 1 marta oxirgi `.dump` ni serverdan tashqariga (masalan, shifrlangan holda boshqa bulut/Hetzner Storage Box) nusxalash. Hozircha: har oyda qo'lda yuklab olib `02_Databases` ga qo'shish. Ish sifatida alohida rejalashtiriladi. |
| Render? | **Aniqlandi:** 2026-07-18 da baza Render'dan Hetzner'ga ko'chirilgan (`render-inventory-sales-*.dump` shu uchun). Render xizmatlari hozir ishlatilmaydi, lekin Render akkaunti/DB hali o'chirilganmi — **bilmaymiz**. Egasi Render panelida tekshirib, keraksiz bo'lsa o'chirishi tavsiya (parol/ma'lumot saqlanib qolmasin). `render.yaml` repoda tarixiy fayl sifatida qoldi. |

## Hal qilindi
- (hozircha yo'q)
