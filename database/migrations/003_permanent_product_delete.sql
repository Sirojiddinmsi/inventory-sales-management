-- Remove old soft-deleted products that have no sale history.
DELETE FROM purchases
WHERE product_id IN (
  SELECT p.id
  FROM products p
  WHERE p.is_active = FALSE
    AND NOT EXISTS (
      SELECT 1 FROM sale_items si WHERE si.product_id = p.id
    )
);

DELETE FROM products p
WHERE p.is_active = FALSE
  AND NOT EXISTS (
    SELECT 1 FROM sale_items si WHERE si.product_id = p.id
  );

-- Historical hidden products with sales remain for invoice integrity, but no
-- longer block a new active product from using the same code.
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS products_active_code_key
ON products(code)
WHERE is_active = TRUE;
