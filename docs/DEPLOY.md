# Deploy, server va qayta tiklash

> Belgilar: ✅ = fayllar/hujjatlardan tasdiqlangan; ⚠️ = oldingi ishdan (ombor.md) olingan yoki taxmin — birinchi deployda egasi bilan tasdiqlang.

## Server ✅
- Hetzner, IP `95.216.184.39`. Sayt `https://95.216.184.39/` (IP uchun Let's Encrypt sertifikati, `/etc/letsencrypt`).
- Loyiha papkasi: `/opt/tikuv-market` — manba kod, `.env` (faqat serverda, 0600), `docker-compose.prod.yml`, `uploads/`.
- Konteynerlar (Compose loyiha nomi `tikuv-market`): `tikuv-market-db-1` (Postgres 17, volume `postgres_data`), `tikuv-market-api-1`, `tikuv-market-web-1` (nginx 80/443).
- SSH: faqat kalit bilan (`PasswordAuthentication no`, `PermitRootLogin prohibit-password`). Kalit `04_Server_Access_Keys/.ssh/hetzner_tikuv_market_ed25519` (zaxira papkada). **Kalitni repoga/GitHub'ga/chatga qo'ymang.**
- `deploy/` ichidagi fayllar serverdagi nusxalar: `docker-compose.prod.yml`, `99-tikuv-market.conf` (sshd), `bootstrap-env.sh` (birinchi marta `.env` yaratadi, tasodifiy sirlar bilan), `ensure-public-api-url.sh`, `reload-tikuv-market-web.sh` (nginx reload), `tikuv-market-db-backup.{sh,service,timer}`.

## Avtomatik DB backup ✅
- Systemd timer har 6 soatda (00:15, 06:15, 12:15, 18:15 Toshkent vaqti) `pg_dump --format=custom` qiladi → `/var/backups/tikuv-market/postgres/inventory_sales-<UTC>.dump` (+ `.sha256`), `pg_restore --list` bilan tekshiriladi, 30 kundan eskilari o'chadi.
- Zaxira papkadagi `02_Databases/*.dump` shu backuplardan.
- **Backup faqat shu serverning o'zida** — server o'lsa yo'qoladi. ⚠️ Serverdan tashqariga nusxa (boshqa joy) hozircha avtomatik emas — `OPEN_ISSUES.md`.

## Release jarayoni (qo'lda) ⚠️
Oldingi deploylar (ombor.md, `.deploy-backups/`) asosida:
1. Lokal: branch → o'zgarish → `npm run typecheck && npm test && npm run build` → egasi lokalda tasdiqlaydi.
2. PR → `main` ga merge (egasi ruxsati bilan). `main` har doim deploy qilinadigan holatda.
3. **Serverda deploydan oldin:**
   - DB backup: `sudo /usr/local/sbin/tikuv-market-db-backup` (yoki oxirgi timer backup yangi ekanini tekshirish).
   - Eski manbaning rollback arxivi: `/var/backups/tikuv-market/releases/source-before-<nom>-<UTC>.tar.gz`.
4. Yangi manbani `/opt/tikuv-market` ga qo'yish. ✅ Serverda `.git` yo'q: kod fayl/tar sifatida ko'chiriladi (o'zgargan fayllarning eski nusxasi va eski image ID `.deploy-backups/<UTC>/` ga saqlanib borgan). **Qoida:** faqat `main` dan olingan kod (`git archive main | tar` ...) chiqariladi va serverda `DEPLOYED_COMMIT` fayliga commit SHA yoziladi, shunda server ↔ GitHub farqi doim ko'rinadi. `.env`, `uploads/`, `docker-compose.prod.yml` ga tegilmaydi.
5. `docker compose -f docker-compose.prod.yml up -d --build api web` (⚠️ aniq buyruqni tasdiqlang). DB konteyneriga tegilmaydi. API ishga tushganda `scripts/bootstrap-db.mjs` yangi migratsiyalarni **avtomatik** qo'llaydi → migratsiyali release'da avval backup shart.
6. nginx config o'zgargan bo'lsa: `nginx -t`, keyin `deploy/reload-tikuv-market-web.sh`.

## Deploydan keyin smoke test ✅
- `https://95.216.184.39/` → 200, TLS xatosiz.
- `https://95.216.184.39/health` → `{"status":"ok","schemaVersion":"<oxirgi migratsiya>"}`.
- Login (o'qish oqimlari): Sotuvlar ro'yxati, nakladnoy ochish, Qarzlar, Hisobot. Yozish (test sotuv) faqat egasi aytsa.
- `docker ps`: `db`, `api` healthy/up. (Eslatma: web healthcheck HTTP→HTTPS redirect sababli ba'zan `starting/unhealthy` ko'rinadi, bu sayt ishlamayotganini bildirmaydi.)

## Rollback ⚠️
- **Faqat kod (migratsiyasiz):** `releases/source-before-*.tar.gz` ni qaytarib, `api`/`web` ni qayta build. Yoki git'da `git revert <commit>` → qayta deploy.
- **Migratsiyali:** migratsiyalar additiv yozilgan; odatda forward-fix. Ma'lumot buzilsa — backupdan tiklash (`pg_restore`) **faqat egasi bilan**, chunki backupdan keyingi savdolar yo'qoladi.
- Hech qachon production DB'da `drop/truncate/reset` qilmang.

## "Global sayt buzildi" — tekshiruv ro'yxati
1. `https://95.216.184.39/health` ochiladimi? Ochilmasa → `docker ps`, `docker logs tikuv-market-api-1 --tail 100`.
2. Oxirgi o'zgarish nima? `git log -5` (`main`) va serverdagi `CHANGELOG.md`/`.deploy-backups/` — qaysi deploy oxirgi bo'lgan?
3. Serverdagi kod `main` bilan bir xilmi? (farq bo'lsa — bu o'zi muammo manbai bo'lishi mumkin.)
4. API xato: loglarda `Invalid environment variables` → `.env` tekshiring; DB ulanish → `tikuv-market-db-1` healthy-mi.
5. Rasmlar chiqmasa → `/media/` nginx proxy (commit `614e5fd`) va `OPEN_ISSUES.md` dagi rasm URL eslatmasi.
6. Tuzatishni lokalda qayta hosil qil → branch → tuzat → egasi tasdig'i → deploy.

## Lokal ishga tushirish (Windows, test uchun)
Talab: Node >=22, (ixtiyoriy) Docker yoki portable Postgres.
```bash
npm ci
cp .env.example .env      # DATABASE_URL, JWT_SECRET (>=32 belgi) ni lokal qiymatlar bilan to'ldiring
```
**Variant A — Docker:** `docker compose up --build` → sayt `http://localhost:5173`, API `:4000`.
**Variant B — lokal Postgres (portable, repoda yo'q, `tools/` gitignore'da):** `scripts/start-local.ps1` Postgresni ishga tushirib migratsiyalarni qo'llaydi, API/webni ishga tushiradi. (Skript birinchi marta mavjud bazaning parolini so'raydi.)
**Variant C — qo'lda (dev):**
```bash
# Postgres ishlab turgan bo'lsin, migratsiyalar qo'llangan: node scripts/bootstrap-db.mjs (DATABASE_URL bilan)
npx tsx apps/api/src/server.ts          # ildizdan; .env shu yerdan o'qiladi
cd apps/web && npx vite --host 127.0.0.1
```
Birinchi admin: baza bo'sh bo'lsa `/register` (setup) orqali. **Lokal bazaga production dump'ini tiklash faqat shaxsiy kompyuterda test uchun**; parol/real mijoz ma'lumotini repoga, chatga qo'ymang.
