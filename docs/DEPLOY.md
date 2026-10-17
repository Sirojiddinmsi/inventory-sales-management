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

## Oxirgi deploy: 2026-10-17 ✅ (namuna, shu tartibda takrorlang)
Qilingan qadamlar (frontend-only o'zgarish uchun, `main` = `3a97194`):
1. Server holati: `docker ps`, `/health`, disk; serverdagi fayl `main` (oldingi commit) bilan bir xilligini sha256 bilan tekshirish (CR/LF farqini `tr -d '\r'` bilan e'tiborsiz qoldirib).
2. Backup: `/usr/local/sbin/tikuv-market-db-backup` → dump + `sha256sum -c`. Rollback: `docker tag tikuv-market-web:latest tikuv-market-web:rollback-<nom>-<UTC>`; eski fayllarni `/var/backups/tikuv-market/releases/<nom>-before-<UTC>/` ga `cp --parents`.
3. Faqat o'zgargan fayllarni `git show main:<fayl>` (LF) → `scp` → serverda sha256 tekshirish.
4. `cd /opt/tikuv-market && docker compose -f docker-compose.prod.yml build web` → `docker tag ...:latest ...:<nom>-<sha>` → `docker compose -f docker-compose.prod.yml up -d --no-deps web` (api: `build api` + `up -d --no-deps api`; migratsiyali bo'lsa avval backup!).
5. `echo <sha> > /opt/tikuv-market/DEPLOYED_COMMIT`.
6. Smoke: `curl https://95.216.184.39/` (200, TLS), `/health`, yangi bundle ichida belgi (`grep` JS chunk), `docker logs tikuv-market-api-1 --since 10m`.
- SSH: `ssh -i <kalit> root@95.216.184.39` (kalit `04_Server_Access_Keys/.ssh/`; `known_hosts` bilan, `StrictHostKeyChecking=yes`).

## Serverda tekshirilgan holat (2026-10-17, faqat o'qish) ✅
- Server manbasi `main` (`96e7a93`) bilan bir xil (177 fayl solishtirildi; farq faqat ikkita eski `debt.*test.ts` va CR/LF qator oxirlari).
- Ishlayotgan image'lar: `tikuv-market-web|api:issue005-96e7a93` (= `:latest`). Eski image'lar `release-issue004-5de0067-...`, `rollback-issue005-<UTC>` teglari bilan saqlangan → **rollback = eski image'ni `:latest` qilib qayta ko'tarish** (build shart emas).
- Konvensiya: har release oldidan `/var/backups/tikuv-market/releases/<issueNNN>-before-<UTC>/` ga eski fayllar, `.deploy-backups/<UTC>-<nom>/` ga image ID, image'ga `issueNNN-<sha>` va `rollback-...` teglari qo'yilgan.
- `/health` → `ok`, schema `019_customer_debt_payment_batches`. DB backup oxirgi marta 13:17 UTC (har 6 soatda, `/var/backups/tikuv-market/postgres`). Disk 29% band.
- Konteynerlar: `db` (healthy), `api` (up), `web` (up; healthcheck noto'g'ri `unhealthy` ko'rsatadi, `OPEN_ISSUES.md` ga qarang).

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
