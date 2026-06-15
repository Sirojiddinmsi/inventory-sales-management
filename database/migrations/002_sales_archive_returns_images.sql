ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS returned_amount NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (returned_amount >= 0),
  ADD COLUMN IF NOT EXISTS returned_profit NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS returned_quantity NUMERIC(18, 3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS returned_amount NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (returned_amount >= 0),
  ADD COLUMN IF NOT EXISTS returned_profit NUMERIC(18, 2) NOT NULL DEFAULT 0;

ALTER TABLE sale_items
  DROP CONSTRAINT IF EXISTS sale_items_returned_quantity_check;

ALTER TABLE sale_items
  ADD CONSTRAINT sale_items_returned_quantity_check
  CHECK (returned_quantity >= 0 AND returned_quantity <= quantity);

ALTER TABLE debts
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT;

CREATE TABLE IF NOT EXISTS sale_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  sale_item_id UUID NOT NULL REFERENCES sale_items(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity NUMERIC(18, 3) NOT NULL CHECK (quantity > 0),
  amount NUMERIC(18, 2) NOT NULL CHECK (amount >= 0),
  profit_reversal NUMERIC(18, 2) NOT NULL,
  reason TEXT,
  returned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_archived_at ON sales(archived_at);
CREATE INDEX IF NOT EXISTS idx_debts_archived_at ON debts(archived_at);
CREATE INDEX IF NOT EXISTS idx_sale_returns_sale_id ON sale_returns(sale_id, returned_at DESC);
CREATE INDEX IF NOT EXISTS idx_sale_returns_product_id ON sale_returns(product_id);

CREATE TABLE IF NOT EXISTS product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  position SMALLINT NOT NULL CHECK (position BETWEEN 1 AND 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, position)
);

INSERT INTO product_images (product_id, image_url, position)
SELECT id, image_url, 1
FROM products
WHERE image_url IS NOT NULL AND image_url <> ''
ON CONFLICT (product_id, position) DO NOTHING;

DROP TRIGGER IF EXISTS sales_updated_at ON sales;
CREATE TRIGGER sales_updated_at BEFORE UPDATE ON sales
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
