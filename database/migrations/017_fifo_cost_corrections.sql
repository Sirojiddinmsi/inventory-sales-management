CREATE TABLE IF NOT EXISTS fifo_cost_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  old_unit_cost NUMERIC(18, 2) NOT NULL CHECK (old_unit_cost >= 0),
  new_unit_cost NUMERIC(18, 2) NOT NULL CHECK (new_unit_cost >= 0),
  affected_quantity NUMERIC(18, 3) NOT NULL CHECK (affected_quantity > 0),
  old_total_cost NUMERIC(18, 2) NOT NULL CHECK (old_total_cost >= 0),
  new_total_cost NUMERIC(18, 2) NOT NULL CHECK (new_total_cost >= 0),
  batch_changes JSONB NOT NULL,
  note VARCHAR(2000),
  corrected_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  corrected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fifo_cost_corrections_product
  ON fifo_cost_corrections(product_id, corrected_at DESC);

