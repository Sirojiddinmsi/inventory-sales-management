CREATE TABLE IF NOT EXISTS inventory_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  purchase_id UUID REFERENCES purchases(id) ON DELETE SET NULL,
  initial_quantity NUMERIC(18, 3) NOT NULL CHECK (initial_quantity > 0),
  remaining_quantity NUMERIC(18, 3) NOT NULL CHECK (
    remaining_quantity >= 0 AND remaining_quantity <= initial_quantity
  ),
  purchase_price NUMERIC(18, 2) NOT NULL CHECK (purchase_price >= 0),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source VARCHAR(30) NOT NULL DEFAULT 'PURCHASE',
  source_reference_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_batches_fifo
  ON inventory_batches(product_id, received_at, created_at, id)
  WHERE remaining_quantity > 0;

CREATE INDEX IF NOT EXISTS idx_inventory_batches_purchase
  ON inventory_batches(purchase_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_batches_legacy_source
  ON inventory_batches(source_reference_id)
  WHERE source = 'LEGACY_SALE' AND source_reference_id IS NOT NULL;

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS fifo_cost NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS returned_fifo_cost NUMERIC(18, 2) NOT NULL DEFAULT 0;

ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS fifo_cost NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS returned_fifo_cost NUMERIC(18, 2) NOT NULL DEFAULT 0;

ALTER TABLE sale_returns
  ADD COLUMN IF NOT EXISTS fifo_cost_reversal NUMERIC(18, 2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS sale_item_batch_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_item_id UUID NOT NULL REFERENCES sale_items(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES inventory_batches(id) ON DELETE RESTRICT,
  quantity NUMERIC(18, 3) NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(18, 2) NOT NULL CHECK (unit_cost >= 0),
  cost_amount NUMERIC(18, 2) NOT NULL CHECK (cost_amount >= 0),
  returned_quantity NUMERIC(18, 3) NOT NULL DEFAULT 0,
  archived_released_quantity NUMERIC(18, 3) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sale_item_id, batch_id),
  CHECK (
    returned_quantity >= 0
    AND archived_released_quantity >= 0
    AND returned_quantity + archived_released_quantity <= quantity
  )
);

CREATE INDEX IF NOT EXISTS idx_sale_batch_allocations_item
  ON sale_item_batch_allocations(sale_item_id);

CREATE INDEX IF NOT EXISTS idx_sale_batch_allocations_batch
  ON sale_item_batch_allocations(batch_id);

-- Preserve historical accounting values before true FIFO starts.
UPDATE sale_items
SET fifo_cost = GREATEST(total_amount - profit, 0),
    returned_fifo_cost = GREATEST(returned_amount - returned_profit, 0)
WHERE fifo_cost = 0 AND total_amount > 0;

UPDATE sales
SET fifo_cost = GREATEST(total_amount - profit, 0),
    returned_fifo_cost = GREATEST(returned_amount - returned_profit, 0)
WHERE fifo_cost = 0 AND total_amount > 0;

UPDATE sale_returns
SET fifo_cost_reversal = GREATEST(amount - profit_reversal, 0)
WHERE fifo_cost_reversal = 0 AND amount > 0;

-- Current physical stock becomes the opening FIFO layer.
INSERT INTO inventory_batches (
  product_id, initial_quantity, remaining_quantity, purchase_price,
  received_at, source
)
SELECT
  p.id, p.stock_quantity, p.stock_quantity, p.purchase_price,
  p.created_at, 'OPENING'
FROM products p
WHERE p.stock_quantity > 0
  AND NOT EXISTS (
    SELECT 1 FROM inventory_batches ib WHERE ib.product_id = p.id
  );

-- Existing sales get historical consumed layers so future returns/archive actions
-- can restore their original purchase cost without changing today's stock.
INSERT INTO inventory_batches (
  id, product_id, initial_quantity, remaining_quantity, purchase_price,
  received_at, source, source_reference_id
)
SELECT
  gen_random_uuid(), si.product_id, si.quantity, 0, si.purchase_price,
  s.sold_at, 'LEGACY_SALE', si.id
FROM sale_items si
JOIN sales s ON s.id = si.sale_id
WHERE NOT EXISTS (
  SELECT 1
  FROM sale_item_batch_allocations a
  WHERE a.sale_item_id = si.id
)
ON CONFLICT DO NOTHING;

INSERT INTO sale_item_batch_allocations (
  sale_item_id, batch_id, quantity, unit_cost, cost_amount,
  returned_quantity, archived_released_quantity
)
SELECT
  si.id,
  ib.id,
  si.quantity,
  si.purchase_price,
  si.fifo_cost,
  si.returned_quantity,
  CASE
    WHEN s.archived_at IS NOT NULL THEN si.quantity - si.returned_quantity
    ELSE 0
  END
FROM sale_items si
JOIN sales s ON s.id = si.sale_id
JOIN inventory_batches ib
  ON ib.source = 'LEGACY_SALE'
 AND ib.source_reference_id = si.id
WHERE NOT EXISTS (
  SELECT 1
  FROM sale_item_batch_allocations a
  WHERE a.sale_item_id = si.id
);
