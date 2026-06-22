CREATE TABLE IF NOT EXISTS supplier_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity NUMERIC(18, 3) NOT NULL CHECK (quantity > 0),
  fifo_cost NUMERIC(18, 2) NOT NULL CHECK (fifo_cost >= 0),
  agreed_return_price NUMERIC(18, 2) NOT NULL CHECK (agreed_return_price >= 0),
  supplier_return_profit NUMERIC(18, 2) NOT NULL,
  returned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_returns_date
  ON supplier_returns(returned_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_supplier_returns_product
  ON supplier_returns(product_id, returned_at DESC);

CREATE TABLE IF NOT EXISTS supplier_return_batch_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_return_id UUID NOT NULL REFERENCES supplier_returns(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES inventory_batches(id) ON DELETE RESTRICT,
  quantity NUMERIC(18, 3) NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(18, 2) NOT NULL CHECK (unit_cost >= 0),
  cost_amount NUMERIC(18, 2) NOT NULL CHECK (cost_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (supplier_return_id, batch_id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_return_allocations_return
  ON supplier_return_batch_allocations(supplier_return_id);

CREATE INDEX IF NOT EXISTS idx_supplier_return_allocations_batch
  ON supplier_return_batch_allocations(batch_id);
