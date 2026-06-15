# REST API endpoints

Base URL: `http://localhost:4000/api/v1`

All endpoints except `/auth/login` and `/auth/register` require:

```http
Authorization: Bearer <jwt-token>
```

## Authentication

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/auth/login` | Public | Login and receive JWT |
| POST | `/auth/register` | Public, first user only | Bootstrap first admin |
| GET | `/auth/me` | Authenticated | Current JWT user |
| POST | `/auth/users` | Admin | Create Admin or Seller |

## Dashboard and settings

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/dashboard` | Authenticated | Today's sales, profit, stock, debt and payment stats |
| GET | `/settings` | Authenticated | Shop settings |
| PATCH | `/settings` | Admin | Update shop settings |

## Products and categories

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/products` | Authenticated | Paginated product list and filters |
| GET | `/products/:id` | Authenticated | Product details |
| POST | `/products` | Authenticated | Create product |
| GET | `/products/import-template.xlsx` | Authenticated | Download Excel import template |
| POST | `/products/import` | Authenticated | Create/update products and add stock from parsed Excel rows |
| PATCH | `/products/:id` | Authenticated | Update product |
| DELETE | `/products/:id` | Admin | Soft-delete product |
| GET | `/categories` | Authenticated | Category list |
| GET | `/categories/:id` | Authenticated | Category details |
| POST | `/categories` | Admin | Create category |
| PATCH | `/categories/:id` | Admin | Update category |
| DELETE | `/categories/:id` | Admin | Delete unused category |

Product filters: `page`, `limit`, `search`, `categoryId`, `lowStock`, `sortBy`, `sortOrder`.

`salePrice` is an optional suggested price. Every sale item accepts its own actual `salePrice`.

Excel import matches existing products by code. Existing stock is increased; new codes create products. Imported quantities are also recorded in purchase history.

## Suppliers and customers

The same CRUD shape is available at `/suppliers` and `/customers`.

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/{resource}` | Authenticated | Paginated list |
| POST | `/{resource}` | Authenticated | Create contact |
| PATCH | `/{resource}/:id` | Authenticated | Update contact |
| DELETE | `/{resource}/:id` | Admin | Delete contact |

## Purchases

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/purchases` | Authenticated | Purchase history |
| POST | `/purchases` | Authenticated | Create purchase and increase stock |

Filters: `search`, `supplierId`, `productId`, `from`, `to`, pagination and sorting.

## Sales

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/sales` | Authenticated | Sale history |
| POST | `/sales` | Authenticated | Atomic sale, stock decrease and optional debt |
| GET | `/sales/:id` | Authenticated | Sale with line items |
| GET | `/sales/:id/receipt.pdf` | Authenticated | Download PDF receipt |

Filters: `search`, `productId`, `categoryId`, `paymentType`, `from`, `to`, pagination and sorting.

Payment types: `CASH`, `CARD`, `DEBT`.

## Debts

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/debts` | Authenticated | Debt list and customer search |
| GET | `/debts/:id` | Authenticated | Debt and payment history |
| POST | `/debts/:id/payments` | Authenticated | Partial or full payment |

Debt statuses: `UNPAID`, `PARTIALLY_PAID`, `PAID`.

## Expenses

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/expenses` | Authenticated | Expense list |
| POST | `/expenses` | Authenticated | Create expense |
| PATCH | `/expenses/:id` | Authenticated | Update expense |
| DELETE | `/expenses/:id` | Admin | Delete expense |

## Reports and export

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/reports` | Authenticated | Summary, daily, product, category, payment and expense reports |
| GET | `/reports/export.xlsx` | Authenticated | Download Excel report |

Report filters: `from`, `to`, `productId`, `categoryId`, `paymentType`.

## System

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/health` | Public | API and database health |

Dates use ISO 8601, for example `2026-06-01T00:00:00+05:00`.
