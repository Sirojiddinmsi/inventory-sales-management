ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS location VARCHAR(120),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

UPDATE purchases pu
SET location = p.location
FROM products p
WHERE pu.product_id = p.id
  AND pu.location IS NULL
  AND p.location IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_purchases_active_date
  ON purchases(purchased_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS purchase_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  action VARCHAR(20) NOT NULL CHECK (action IN ('UPDATE', 'DELETE')),
  before_data JSONB NOT NULL,
  after_data JSONB,
  edited_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  edited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_audit_logs_purchase
  ON purchase_audit_logs(purchase_id, edited_at DESC);
