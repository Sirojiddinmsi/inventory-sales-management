ALTER TABLE products
  ADD COLUMN IF NOT EXISTS location VARCHAR(120);

CREATE INDEX IF NOT EXISTS idx_products_location
  ON products(location);
