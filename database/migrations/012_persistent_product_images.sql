CREATE TABLE IF NOT EXISTS product_image_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type VARCHAR(80) NOT NULL CHECK (content_type = 'image/webp'),
  data BYTEA NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 2097152),
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  original_name VARCHAR(255),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (octet_length(data) = byte_size)
);

CREATE INDEX IF NOT EXISTS idx_product_image_files_created_at
  ON product_image_files(created_at DESC);

-- Render's ephemeral /uploads files cannot survive a restart. Remove only
-- those broken/local references; existing external HTTPS image URLs remain.
DELETE FROM product_images
WHERE image_url !~* '^https?://'
   OR image_url LIKE '%/uploads/products/%';

UPDATE products
SET image_url = NULL
WHERE image_url IS NOT NULL
  AND (
    image_url !~* '^https?://'
    OR image_url LIKE '%/uploads/products/%'
  );
