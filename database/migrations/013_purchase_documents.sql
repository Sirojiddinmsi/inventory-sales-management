CREATE SEQUENCE IF NOT EXISTS purchase_document_number_seq START WITH 1;

CREATE TABLE IF NOT EXISTS purchase_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_number VARCHAR(40) NOT NULL UNIQUE DEFAULT (
    'PR-' || LPAD(nextval('purchase_document_number_seq')::text, 5, '0')
  ),
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS purchase_document_id UUID;

-- There is no reliable transaction/document identifier on legacy purchase rows.
-- Use a separate document per item instead of guessing and merging unrelated rows.
INSERT INTO purchase_documents (
  id, supplier_id, purchased_at, created_by, created_at, updated_at
)
SELECT
  pu.id, pu.supplier_id, pu.purchased_at, pu.created_by, pu.created_at,
  COALESCE(pu.updated_at, pu.created_at)
FROM purchases pu
WHERE pu.purchase_document_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM purchase_documents pd WHERE pd.id = pu.id)
ORDER BY pu.created_at, pu.id;

UPDATE purchases
SET purchase_document_id = id
WHERE purchase_document_id IS NULL;

ALTER TABLE purchases
  ALTER COLUMN purchase_document_id SET NOT NULL,
  ADD CONSTRAINT purchases_document_id_fkey
    FOREIGN KEY (purchase_document_id)
    REFERENCES purchase_documents(id)
    ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_purchases_document_id
  ON purchases(purchase_document_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_documents_date
  ON purchase_documents(purchased_at DESC, id DESC);
