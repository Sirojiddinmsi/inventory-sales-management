# Inventory & Sales Management System

Full-stack inventory, sales, profit, expense and customer debt management for a sewing-machine parts shop.

## Stack

- Frontend: React 19, TypeScript, Vite, TanStack Query, React Router, Recharts
- Backend: Node.js, Express 5, TypeScript, Zod
- Database: PostgreSQL 17
- Authentication: JWT with Admin and Seller roles
- Deployment: Docker, Docker Compose and Nginx

## Folder structure

```text
inventory-sales-management/
|-- apps/
|   |-- api/
|   |   |-- src/
|   |   |   |-- config/              # Environment and PostgreSQL pool
|   |   |   |-- middlewares/         # JWT, RBAC and error handling
|   |   |   |-- modules/             # Controllers, services, repositories
|   |   |   |-- routes/
|   |   |   |-- shared/
|   |   |   |-- app.ts
|   |   |   `-- server.ts
|   |   |-- Dockerfile
|   |   `-- package.json
|   `-- web/
|       |-- src/
|       |   |-- components/          # Layout and shared UI
|       |   |-- contexts/            # JWT session
|       |   |-- lib/                 # API client and formatters
|       |   |-- pages/               # Admin panel pages
|       |   |-- types/
|       |   |-- App.tsx
|       |   `-- main.tsx
|       |-- Dockerfile
|       |-- nginx.conf
|       |-- package.json
|       `-- vite.config.ts
|-- database/
|   |-- migrations/001_initial_schema.sql
|   `-- seeds/001_default_data.sql
|-- docs/API.md
|-- .env.example
|-- docker-compose.yml
|-- package.json
`-- tsconfig.base.json
```

## Backend architecture

Each business module is separated into:

- `schema`: Zod request validation
- `controller`: HTTP request and response handling
- `service`: business rules
- `repository`: PostgreSQL queries and transactions
- `routes`: REST endpoint definitions

Purchases, sales and debt payments use database transactions. Sales lock product rows before stock validation to prevent overselling under concurrent requests.

## Frontend

The responsive admin panel includes:

- Login and first-admin registration
- Dashboard cards, payment charts and low-stock warnings
- Product and category CRUD
- Excel product/stock import with downloadable template
- Purchase entry with supplier creation
- Multi-item sales form, discounts and payment types
- Flexible per-sale product prices; the product price is only a suggestion
- Automatic debt creation and partial/full debt payments
- Expense CRUD
- Profit, expense, product and payment reports
- Excel report and PDF receipt download
- Shop settings and Admin/Seller user creation

Routes are code-split so charts and large modules load only when their pages are opened.

## Database

The migration creates:

`users`, `products`, `categories`, `purchases`, `sales`, `sale_items`, `debts`, `debt_payments`, `expenses`, `suppliers`, `customers`, `settings`.

It also adds indexes, foreign keys, numeric checks, enums and automatic `updated_at` triggers.

## Docker setup

1. Create the environment file:

```powershell
Copy-Item .env.example .env
```

2. Replace `JWT_SECRET` and database passwords in `.env`.

3. Start PostgreSQL, API and frontend:

```powershell
docker compose up --build
```

4. Check health:

```powershell
Invoke-RestMethod http://localhost:4000/health
```

Open the admin panel:

```text
http://localhost:5173
```

The initial Docker database seed creates:

```text
Email: admin@example.com
Password: Admin123!
```

Change this development password immediately in a real environment. Docker init scripts only run when the PostgreSQL volume is created for the first time.

## Render deploy

Render supports free web services, static sites, and Postgres on the Hobby plan. Render documents:

- Blueprints via `render.yaml`: https://render.com/docs/blueprint-spec
- Static sites: https://render.com/docs/static-sites
- Web services: https://render.com/docs/web-services
- Free plan limits: https://render.com/docs/free

This repository now includes [render.yaml](render.yaml) for a three-part deploy:

- `tikuv-market-db` - Render Postgres
- `tikuv-market-api` - Node/Express API
- `tikuv-market-web` - React static site

### Before deploy

1. Put this project in a Git repository and push it to GitHub.
2. Create a Render account.
3. In Render, click **New +** -> **Blueprint** and connect the GitHub repository.

### Blueprint notes

- Render will prompt for `JWT_SECRET` because it is marked with `sync: false`.
- The Blueprint sets `CORS_ORIGIN=*` for the first deploy so the frontend can reach the API immediately.
- After the first deploy, tighten `CORS_ORIGIN` to your actual frontend domain in the API service settings, for example:

```text
https://tikuv-market-web.onrender.com
```

- The static site uses:

```text
VITE_API_URL=https://tikuv-market-api.onrender.com/api/v1
```

If Render assigns a different API hostname, update `VITE_API_URL` in the `tikuv-market-web` service and redeploy it.

### First login on Render

After the database is created, open the API shell or connect with psql and run the seed file:

```powershell
psql "<RENDER_EXTERNAL_DATABASE_URL>" -f database/seeds/001_default_data.sql
```

Or run the SQL manually to create the first admin. By default the seed creates:

```text
Email: admin@example.com
Password: Admin123!
```

Change this password immediately after login.

## Local setup

Requirements:

- Node.js 22 or newer
- npm 10 or newer

### Quick start on this Windows computer

Portable PostgreSQL is included in the local `tools` folder. Double-click:

```text
START-SITE.cmd
```

The launcher initializes PostgreSQL, applies the migration and seed, starts the API and frontend, then opens:

```text
http://127.0.0.1:5173
```

To stop all local services, double-click:

```text
STOP-SITE.cmd
```

Default development credentials:

```text
Email: admin@example.com
Password: Admin123!
```

### Manual setup

Install packages:

```powershell
npm.cmd install
```

Create a PostgreSQL database and run:

```powershell
psql -d inventory_sales -f database/migrations/001_initial_schema.sql
psql -d inventory_sales -f database/seeds/001_default_data.sql
```

Create `.env` from `.env.example` and update `DATABASE_URL`.

Start the API:

```powershell
npm.cmd run dev:api
```

Start the frontend in a second terminal:

```powershell
npm.cmd run dev:web
```

- Frontend: `http://localhost:5173`
- API: `http://localhost:4000/api/v1`
- Health: `http://localhost:4000/health`

Vite proxies `/api` and `/health` to the local API. For a separately hosted API, set `VITE_API_URL` in `apps/web/.env`.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
npm.cmd audit --omit=dev
```

## API documentation

See [docs/API.md](docs/API.md) for all endpoints, filters, roles and export routes.
