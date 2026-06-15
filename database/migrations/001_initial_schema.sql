CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('ADMIN', 'SELLER');
CREATE TYPE payment_type AS ENUM ('CASH', 'CARD', 'DEBT');
CREATE TYPE debt_status AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'SELLER',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL UNIQUE,
  slug VARCHAR(140) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  brand VARCHAR(120),
  unit VARCHAR(40) NOT NULL DEFAULT 'dona',
  purchase_price NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
  sale_price NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
  stock_quantity NUMERIC(18, 3) NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  minimum_stock NUMERIC(18, 3) NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0),
  image_url TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_products_name ON products USING gin (to_tsvector('simple', name));
CREATE INDEX idx_products_category_id ON products(category_id);
CREATE INDEX idx_products_low_stock ON products(stock_quantity, minimum_stock) WHERE is_active = TRUE;

CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(40),
  address TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(40),
  address TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customers_name_phone ON customers(name, phone);

CREATE TABLE purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity NUMERIC(18, 3) NOT NULL CHECK (quantity > 0),
  purchase_price NUMERIC(18, 2) NOT NULL CHECK (purchase_price >= 0),
  total_cost NUMERIC(18, 2) NOT NULL CHECK (total_cost >= 0),
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_purchases_product_date ON purchases(product_id, purchased_at DESC);
CREATE INDEX idx_purchases_supplier_id ON purchases(supplier_id);

CREATE TABLE sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number VARCHAR(40) NOT NULL UNIQUE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name VARCHAR(255),
  customer_phone VARCHAR(40),
  subtotal NUMERIC(18, 2) NOT NULL CHECK (subtotal >= 0),
  discount NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total_amount NUMERIC(18, 2) NOT NULL CHECK (total_amount >= 0),
  payment_type payment_type NOT NULL,
  profit NUMERIC(18, 2) NOT NULL,
  sold_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sales_date ON sales(sold_at DESC);
CREATE INDEX idx_sales_payment_type ON sales(payment_type, sold_at DESC);
CREATE INDEX idx_sales_customer_id ON sales(customer_id);

CREATE TABLE sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity NUMERIC(18, 3) NOT NULL CHECK (quantity > 0),
  sale_price NUMERIC(18, 2) NOT NULL CHECK (sale_price >= 0),
  purchase_price NUMERIC(18, 2) NOT NULL CHECK (purchase_price >= 0),
  discount NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total_amount NUMERIC(18, 2) NOT NULL CHECK (total_amount >= 0),
  profit NUMERIC(18, 2) NOT NULL
);

CREATE INDEX idx_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX idx_sale_items_product_id ON sale_items(product_id);

CREATE TABLE debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL UNIQUE REFERENCES sales(id) ON DELETE RESTRICT,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name VARCHAR(255) NOT NULL,
  phone VARCHAR(40),
  amount NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
  paid_amount NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  remaining_amount NUMERIC(18, 2) NOT NULL CHECK (remaining_amount >= 0),
  status debt_status NOT NULL DEFAULT 'UNPAID',
  due_date DATE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (paid_amount <= amount),
  CHECK (remaining_amount = amount - paid_amount)
);

CREATE INDEX idx_debts_status_due_date ON debts(status, due_date);
CREATE INDEX idx_debts_customer ON debts(customer_name, phone);

CREATE TABLE debt_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_id UUID NOT NULL REFERENCES debts(id) ON DELETE RESTRICT,
  amount NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT,
  received_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_debt_payments_debt_id ON debt_payments(debt_id, paid_at DESC);

CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_type VARCHAR(120) NOT NULL,
  amount NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
  spent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_expenses_date ON expenses(spent_at DESC);
CREATE INDEX idx_expenses_type ON expenses(expense_type);

CREATE TABLE settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  shop_name VARCHAR(255) NOT NULL DEFAULT 'Inventory & Sales',
  logo_url TEXT,
  phone VARCHAR(40),
  address TEXT,
  currency VARCHAR(10) NOT NULL DEFAULT 'UZS',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER categories_updated_at BEFORE UPDATE ON categories
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER products_updated_at BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER suppliers_updated_at BEFORE UPDATE ON suppliers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER customers_updated_at BEFORE UPDATE ON customers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER debts_updated_at BEFORE UPDATE ON debts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER expenses_updated_at BEFORE UPDATE ON expenses
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER settings_updated_at BEFORE UPDATE ON settings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO settings (id) VALUES (1);

