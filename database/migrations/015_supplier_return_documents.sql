CREATE SEQUENCE IF NOT EXISTS supplier_return_document_number_seq START WITH 1;

CREATE TABLE IF NOT EXISTS supplier_return_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_number TEXT NOT NULL UNIQUE DEFAULT (
    'SR-' || LPAD(nextval('supplier_return_document_number_seq')::text, 5, '0')
  ),
  returned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ
);

ALTER TABLE supplier_returns
  ADD COLUMN IF NOT EXISTS supplier_return_document_id UUID;

INSERT INTO supplier_return_documents (
  id, returned_at, note, created_by, created_at, deleted_by, deleted_at
)
SELECT sr.id, sr.returned_at, sr.note, sr.created_by, sr.created_at, sr.deleted_by, sr.deleted_at
FROM supplier_returns sr
WHERE sr.supplier_return_document_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM supplier_return_documents srd WHERE srd.id = sr.id
  );

UPDATE supplier_returns
SET supplier_return_document_id = id
WHERE supplier_return_document_id IS NULL;

ALTER TABLE supplier_returns
  ALTER COLUMN supplier_return_document_id SET NOT NULL,
  DROP CONSTRAINT IF EXISTS supplier_returns_document_fk,
  ADD CONSTRAINT supplier_returns_document_fk
    FOREIGN KEY (supplier_return_document_id)
    REFERENCES supplier_return_documents(id)
    ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_supplier_returns_document
  ON supplier_returns(supplier_return_document_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_supplier_return_documents_date
  ON supplier_return_documents(returned_at DESC, id DESC)
  WHERE deleted_at IS NULL;
