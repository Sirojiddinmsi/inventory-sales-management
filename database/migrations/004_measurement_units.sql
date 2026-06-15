CREATE TABLE IF NOT EXISTS measurement_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(40) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO measurement_units (name)
VALUES ('dona'), ('quti'), ('komplekt'), ('metr'), ('kg')
ON CONFLICT (name) DO NOTHING;

INSERT INTO measurement_units (name)
SELECT DISTINCT LOWER(TRIM(unit))
FROM products
WHERE unit IS NOT NULL AND TRIM(unit) <> ''
ON CONFLICT (name) DO NOTHING;

UPDATE products SET unit = LOWER(TRIM(unit));

ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS sale_quantity NUMERIC(18, 3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS returned_sale_quantity NUMERIC(18, 3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit VARCHAR(40),
  ADD COLUMN IF NOT EXISTS unit_multiplier NUMERIC(18, 3) NOT NULL DEFAULT 1;

UPDATE sale_items si
SET sale_quantity = si.quantity,
    returned_sale_quantity = si.returned_quantity,
    unit = p.unit,
    unit_multiplier = 1
FROM products p
WHERE p.id = si.product_id
  AND (si.sale_quantity = 0 OR si.unit IS NULL);

ALTER TABLE sale_items
  ALTER COLUMN unit SET NOT NULL,
  DROP CONSTRAINT IF EXISTS sale_items_sale_quantity_check,
  DROP CONSTRAINT IF EXISTS sale_items_returned_sale_quantity_check,
  DROP CONSTRAINT IF EXISTS sale_items_unit_multiplier_check;

ALTER TABLE sale_items
  ADD CONSTRAINT sale_items_sale_quantity_check CHECK (sale_quantity > 0),
  ADD CONSTRAINT sale_items_returned_sale_quantity_check
    CHECK (returned_sale_quantity >= 0 AND returned_sale_quantity <= sale_quantity),
  ADD CONSTRAINT sale_items_unit_multiplier_check CHECK (unit_multiplier > 0);

ALTER TABLE sale_returns
  ADD COLUMN IF NOT EXISTS sale_quantity NUMERIC(18, 3),
  ADD COLUMN IF NOT EXISTS unit VARCHAR(40),
  ADD COLUMN IF NOT EXISTS unit_multiplier NUMERIC(18, 3) NOT NULL DEFAULT 1;

UPDATE sale_returns sr
SET sale_quantity = sr.quantity / si.unit_multiplier,
    unit = si.unit,
    unit_multiplier = si.unit_multiplier
FROM sale_items si
WHERE si.id = sr.sale_item_id
  AND (sr.sale_quantity IS NULL OR sr.unit IS NULL);

ALTER TABLE sale_returns
  ALTER COLUMN sale_quantity SET NOT NULL,
  ALTER COLUMN unit SET NOT NULL,
  DROP CONSTRAINT IF EXISTS sale_returns_sale_quantity_check,
  DROP CONSTRAINT IF EXISTS sale_returns_unit_multiplier_check;

ALTER TABLE sale_returns
  ADD CONSTRAINT sale_returns_sale_quantity_check CHECK (sale_quantity > 0),
  ADD CONSTRAINT sale_returns_unit_multiplier_check CHECK (unit_multiplier > 0);
